# ============================================================
# Realms at War — client Godot 4 (phase 1 : modèles 3D + animations).
# Se connecte au serveur Node (WebSocket+JSON). Les avatars sont de vrais
# personnages riggés glTF, animés (idle/marche/course/mort) via l'AnimationPlayer
# du modèle. Le modèle de démo "RobotExpressive" (CC0) est téléchargé au
# lancement ; en cas d'échec, on garde des capsules. Pour utiliser ton propre
# modèle, dépose un .glb dans godot-client/assets/ (voir README_GODOT.md).
# ============================================================
extends Node3D

@export var server_url: String = "ws://localhost:8080"
# Modèle de démo riggé+animé, CC0 (Tomás Laulhé / Don McCurdy), servi par CDN.
@export var model_url: String = "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/models/gltf/RobotExpressive/RobotExpressive.glb"
# Pour un modèle local : place un fichier ici et il sera prioritaire.
@export var local_model_path: String = "res://assets/character.glb"

const REALM_COLORS := {
    "alb": Color(0.75, 0.19, 0.19),
    "hib": Color(0.19, 0.63, 0.25),
    "mid": Color(0.19, 0.38, 0.75),
}
const REALM_PRESET := {
    "alb": {"cls": "armsman", "race": "Breton"},
    "hib": {"cls": "bard", "race": "Celte"},
    "mid": {"cls": "warrior", "race": "Troll"},
}
const MOVE_SPEED := 16.0
const T_HALF := 1800.0
const FRONTIER_RADIUS := 560.0
const T_BASES := [Vector2(-1083, 625), Vector2(1083, 625), Vector2(0, -1250)]
const T_REALM := ["alb", "hib", "mid"]
const MODEL_HEIGHT := 4.2
const EQUIP_SLOTS := ["weapon", "head", "chest", "feet", "ring", "amulet"]
const SLOT_LABELS := {"weapon": "Arme", "head": "Casque", "chest": "Armure", "feet": "Bottes", "ring": "Anneau", "amulet": "Amulette"}
const RARITY_COLORS := {"commun": Color(0.8,0.82,0.86), "rare": Color(0.35,0.66,0.9), "epique": Color(0.72,0.42,0.88), "legendaire": Color(0.94,0.66,0.23)}

var ws := WebSocketPeer.new()
var connected := false
var in_world := false
var self_id := ""
var me := Vector3.ZERO
var my_realm := "mid"
var entities := {}            # id -> Node3D (conteneur d'avatar)
var move_accum := 0.0

var camera: Camera3D
var player_node: Node3D
var status_label: Label
var name_edit: LineEdit
var realm_opt: OptionButton
var login_panel: Panel
var debug_label: Label
# HUD (phase 2)
var hud: CanvasLayer
var hud_root: Control
var lbl_ident: Label
var lbl_gold: Label
var lbl_fort: Label
var bar_hp := {}
var bar_pw := {}
var bar_xp := {}
var target_panel: Panel
var target_name: Label
var target_hp := {}
var skill_slots := []
var skill_names := ["1","2","3","4","5","6","7","8","9"]
var log_label: Label
var log_lines := []
var stats := {}
var self_cooldowns := {}
var self_learned := []
var fort_owner := ""
var auto_attack := false
var target_id := ""
var entity_info := {}
var scenery_built := false
var BIOME_GROUND := {}
var TREE_FOLIAGE := {}
var dialog: Panel
var dialog_title: Label
var dialog_box: VBoxContainer
var inventory_panel: Panel
var inventory_box: VBoxContainer
var inventory_open := false
# caméra 3e personne (type MMO)
var cam_yaw := 0.0
var cam_pitch := 0.32
var cam_dist := 18.0
var cam_rotating := false
# barre de vie 3D au-dessus de la cible
var target_bar3d: Node3D
var target_bar_fill: MeshInstance3D

var http: HTTPRequest
var model_template: Node3D = null
var model_ready := false
var model_scale := 1.0

func _ready() -> void:
    _setup_world()
    _setup_ui()
    _setup_hud()
    _load_model()

# ---------- Monde ----------
func _setup_world() -> void:
    var sun := DirectionalLight3D.new()
    sun.rotation_degrees = Vector3(-55, -45, 0)
    sun.light_energy = 1.2
    sun.shadow_enabled = true
    add_child(sun)

    var we := WorldEnvironment.new()
    var env := Environment.new()
    env.background_mode = Environment.BG_SKY
    var sky := Sky.new()
    sky.sky_material = ProceduralSkyMaterial.new()
    env.sky = sky
    env.ambient_light_source = Environment.AMBIENT_SOURCE_SKY
    env.fog_enabled = true
    env.fog_density = 0.0008
    we.environment = env
    add_child(we)

    BIOME_GROUND = {"alb": Color8(0x5a,0x7d,0x3a), "hib": Color8(0x37,0x6b,0x30), "mid": Color8(0x9f,0xb0,0xbb), "frontier": Color8(0x7a,0x6f,0x4a)}
    TREE_FOLIAGE = {"alb": Color8(0x4f,0x7a,0x33), "hib": Color8(0x35,0x6e,0x2b), "mid": Color8(0x2f,0x55,0x40), "frontier": Color8(0x6a,0x6a,0x40)}
    _build_terrain()

    var fort := MeshInstance3D.new()
    var cyl := CylinderMesh.new()
    cyl.top_radius = 14.0
    cyl.bottom_radius = 16.0
    cyl.height = 10.0
    fort.mesh = cyl
    fort.position = Vector3(0, 5, 0)
    var fmat := StandardMaterial3D.new()
    fmat.albedo_color = Color(0.6, 0.6, 0.66)
    fort.material_override = fmat
    add_child(fort)

    camera = Camera3D.new()
    camera.current = true
    camera.far = 6000.0
    add_child(camera)

    player_node = _make_avatar(Color(0.92, 0.85, 0.4), "player")
    player_node.visible = false
    add_child(player_node)

    # barre de vie 3D (au-dessus de la cible)
    target_bar3d = Node3D.new()
    target_bar3d.visible = false
    add_child(target_bar3d)
    var tbg := MeshInstance3D.new()
    var qbg := QuadMesh.new(); qbg.size = Vector2(3.0, 0.4); tbg.mesh = qbg
    var mbg := StandardMaterial3D.new()
    mbg.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
    mbg.billboard_mode = BaseMaterial3D.BILLBOARD_ENABLED
    mbg.billboard_keep_scale = true
    mbg.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
    mbg.albedo_color = Color(0, 0, 0, 0.65)
    mbg.no_depth_test = true
    tbg.material_override = mbg
    target_bar3d.add_child(tbg)
    target_bar_fill = MeshInstance3D.new()
    var qf := QuadMesh.new(); qf.size = Vector2(2.86, 0.3); target_bar_fill.mesh = qf
    var mf := StandardMaterial3D.new()
    mf.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
    mf.billboard_mode = BaseMaterial3D.BILLBOARD_ENABLED
    mf.billboard_keep_scale = true
    mf.albedo_color = Color(0.85, 0.2, 0.15)
    mf.no_depth_test = true
    target_bar_fill.material_override = mf
    target_bar_fill.position.z = 0.01
    target_bar3d.add_child(target_bar_fill)

# Conteneur d'avatar : capsule (placeholder) + métadonnées d'animation
func _make_avatar(col: Color, kind: String) -> Node3D:
    var root := Node3D.new()
    var cap := MeshInstance3D.new()
    cap.name = "Capsule"
    var cm := CapsuleMesh.new()
    cm.radius = 0.8
    cm.height = 3.6
    cap.mesh = cm
    var mat := StandardMaterial3D.new()
    mat.albedo_color = col
    cap.material_override = mat
    cap.position.y = 1.8
    root.add_child(cap)
    root.set_meta("kind", kind)
    root.set_meta("has_model", false)
    root.set_meta("anim", null)
    root.set_meta("state", "")
    root.set_meta("action_until", 0)
    root.set_meta("prev", Vector3.ZERO)
    if model_ready:
        _attach_model(root)
    return root

# ---------- Chargement du modèle ----------
func _load_model() -> void:
    # accepte .glb comme .gltf (mets le .gltf AVEC ses fichiers .bin/textures dans assets/)
    var candidates := [local_model_path, "res://assets/character.glb", "res://assets/character.gltf"]
    for path in candidates:
        if ResourceLoader.exists(path):
            var packed = load(path)
            if packed != null:
                model_template = packed.instantiate()
                _dbg("modèle local chargé (" + path + ")")
                _finalize_template()
                return
    # sinon : téléchargement du modèle de démo
    _dbg("téléchargement… " + model_url)
    http = HTTPRequest.new()
    http.timeout = 25.0
    http.body_size_limit = -1
    add_child(http)
    http.request_completed.connect(_on_model_downloaded)
    var err := http.request(model_url)
    if err != OK:
        _dbg("échec HTTPRequest (code %d) — dépose un .glb dans assets/character.glb" % err)

func _on_model_downloaded(result: int, code: int, _headers: PackedStringArray, body: PackedByteArray) -> void:
    if result != HTTPRequest.RESULT_SUCCESS or code != 200 or body.is_empty():
        _dbg("téléchargement échoué (result %d, http %d) — dépose un .glb dans assets/character.glb" % [result, code])
        return
    _dbg("téléchargé (%d Ko), lecture glTF…" % (body.size() / 1024))
    var doc := GLTFDocument.new()
    var st := GLTFState.new()
    var err := doc.append_from_buffer(body, "", st)
    if err != OK:
        _dbg("glTF illisible (err %d)" % err)
        return
    model_template = doc.generate_scene(st)
    if model_template == null:
        _dbg("scène glTF vide")
        return
    _finalize_template()

func _finalize_template() -> void:
    model_template.visible = false
    add_child(model_template)
    model_scale = MODEL_HEIGHT / maxf(0.1, _node_height(model_template))
    model_ready = true
    var ap = model_template.find_child("AnimationPlayer", true, false)
    var clips := ""
    if ap != null:
        clips = ", ".join(ap.get_animation_list())
    _dbg("prêt ✓ scale %.2f — clips: %s" % [model_scale, clips if clips != "" else "(aucun)"])
    # applique au joueur + entités déjà présentes
    _attach_model(player_node)
    for id in entities:
        _attach_model(entities[id])

func _node_height(root: Node) -> float:
    var merged := AABB()
    var got := false
    for mi in root.find_children("*", "MeshInstance3D", true, false):
        var a: AABB = mi.get_aabb()
        var xf: Transform3D = root.global_transform.affine_inverse() * mi.global_transform
        a = xf * a
        if not got:
            merged = a
            got = true
        else:
            merged = merged.merge(a)
    return merged.size.y if got else 1.8

func _attach_model(container: Node3D) -> void:
    if container.get_meta("kind", "") == "mob":
        return  # les monstres restent des silhouettes distinctes
    if not model_ready or container.get_meta("has_model"):
        return
    var cap = container.get_node_or_null("Capsule")
    if cap:
        cap.queue_free()
    var inst: Node3D = model_template.duplicate()
    inst.name = "Model"
    inst.visible = true
    inst.scale = Vector3.ONE * model_scale
    container.add_child(inst)
    container.set_meta("has_model", true)
    var anim = inst.find_child("AnimationPlayer", true, false)
    container.set_meta("anim", anim)
    if anim != null:
        var clips := _map_clips(anim)
        container.set_meta("clips", clips)
        # les clips de locomotion doivent boucler (sinon l'anim se fige sur la dernière image)
        for key in ["idle", "walk", "run"]:
            var nm := String(clips.get(key, ""))
            if nm != "" and anim.has_animation(nm):
                anim.get_animation(nm).loop_mode = Animation.LOOP_LINEAR
        _avatar_state(container, "idle")

func _map_clips(anim: AnimationPlayer) -> Dictionary:
    var names := anim.get_animation_list()
    var find := func(cands):
        for c in cands:
            for n in names:
                if String(n).to_lower().find(c) != -1:
                    return n
        return ""
    return {
        "idle": find.call(["idle"]),
        "walk": find.call(["walk"]),
        "run": find.call(["run", "walk"]),
        "death": find.call(["death", "die"]),
        "attack": find.call(["punch", "attack", "slash"]),
    }

func _avatar_state(container: Node3D, st: String) -> void:
    var anim = container.get_meta("anim", null)
    if anim == null:
        return
    if container.get_meta("state", "") == st:
        return
    var clips: Dictionary = container.get_meta("clips", {})
    var clip := String(clips.get(st, ""))
    if clip == "":
        return
    anim.play(clip, 0.2)
    container.set_meta("state", st)

func _avatar_locomotion(container: Node3D, speed: float, dead: bool) -> void:
    if not container.get_meta("has_model", false):
        return
    if dead:
        _avatar_state(container, "death")
        return
    if int(container.get_meta("action_until", 0)) > Time.get_ticks_msec():
        return
    var st := "idle"
    if speed > 9.0:
        st = "run"
    elif speed > 0.8:
        st = "walk"
    # sécurité : si le clip courant s'est arrêté (modèle non bouclé), on le relance
    var anim = container.get_meta("anim", null)
    if anim != null and not anim.is_playing():
        container.set_meta("state", "")
    _avatar_state(container, st)

func _avatar_action(container: Node3D, kind: String) -> void:
    var anim = container.get_meta("anim", null)
    if anim == null:
        return
    var clips: Dictionary = container.get_meta("clips", {})
    var clip := String(clips.get(kind, ""))
    if clip == "" or not anim.has_animation(clip):
        return
    anim.play(clip, 0.1)
    container.set_meta("state", "_action")
    var dur: float = anim.get_animation(clip).length
    container.set_meta("action_until", Time.get_ticks_msec() + int(minf(dur, 1.2) * 1000.0))

# ---------- Interface ----------
func _setup_ui() -> void:
    var layer := CanvasLayer.new()
    add_child(layer)
    status_label = Label.new()
    status_label.position = Vector2(12, 12)
    status_label.text = "Déconnecté"
    layer.add_child(status_label)
    debug_label = Label.new()
    debug_label.position = Vector2(12, 34)
    debug_label.modulate = Color(0.7, 0.85, 1.0)
    debug_label.text = "Modèle : initialisation…"
    layer.add_child(debug_label)
    login_panel = Panel.new()
    login_panel.position = Vector2(20, 48)
    login_panel.size = Vector2(330, 220)
    layer.add_child(login_panel)
    var vb := VBoxContainer.new()
    vb.position = Vector2(14, 14)
    vb.size = Vector2(302, 192)
    login_panel.add_child(vb)
    var title := Label.new()
    title.text = "Realms at War — client Godot"
    vb.add_child(title)
    name_edit = LineEdit.new()
    name_edit.placeholder_text = "Nom du héros"
    name_edit.text = "Godot"
    vb.add_child(name_edit)
    realm_opt = OptionButton.new()
    realm_opt.add_item("Albion"); realm_opt.set_item_metadata(0, "alb")
    realm_opt.add_item("Hibernia"); realm_opt.set_item_metadata(1, "hib")
    realm_opt.add_item("Midgard"); realm_opt.set_item_metadata(2, "mid")
    realm_opt.select(2)
    vb.add_child(realm_opt)
    var btn := Button.new()
    btn.text = "Se connecter"
    vb.add_child(btn)
    btn.pressed.connect(_on_connect)

func _dbg(t: String) -> void:
    if debug_label:
        debug_label.text = "Modèle : " + t
    print("[modele] ", t)

func _on_connect() -> void:
    status_label.text = "Connexion à " + server_url + " ..."
    var err := ws.connect_to_url(server_url)
    if err != OK:
        status_label.text = "Échec de connexion (code %d)" % err

# ---------- HUD (phase 2) ----------
func _setup_hud() -> void:
    hud = CanvasLayer.new()
    add_child(hud)
    hud_root = Control.new()
    hud_root.set_anchors_preset(Control.PRESET_FULL_RECT)
    hud_root.mouse_filter = Control.MOUSE_FILTER_IGNORE
    hud_root.visible = false   # masqué tant qu'on n'est pas en jeu
    hud.add_child(hud_root)

    var panel := Panel.new()
    panel.position = Vector2(12, 58)
    panel.size = Vector2(266, 112)
    hud_root.add_child(panel)
    lbl_ident = Label.new()
    lbl_ident.position = Vector2(10, 6)
    panel.add_child(lbl_ident)
    bar_hp = _make_bar(panel, Vector2(10, 28), Color(0.78, 0.22, 0.16))
    bar_pw = _make_bar(panel, Vector2(10, 50), Color(0.16, 0.5, 0.78))
    bar_xp = _make_bar(panel, Vector2(10, 72), Color(0.72, 0.6, 0.16))
    lbl_gold = Label.new()
    lbl_gold.position = Vector2(10, 90)
    panel.add_child(lbl_gold)

    lbl_fort = Label.new()
    lbl_fort.position = Vector2(12, 180)
    hud_root.add_child(lbl_fort)

    # cadre de cible (centré en haut)
    target_panel = Panel.new()
    target_panel.size = Vector2(230, 46)
    target_panel.visible = false
    hud_root.add_child(target_panel)
    target_name = Label.new()
    target_name.position = Vector2(10, 4)
    target_panel.add_child(target_name)
    target_hp = _make_bar(target_panel, Vector2(10, 26), Color(0.78, 0.22, 0.16), 210.0)

    # barre de sorts (1-9)
    for i in range(9):
        var sp := Panel.new()
        sp.size = Vector2(52, 52)
        hud_root.add_child(sp)
        var lab := Label.new()
        lab.position = Vector2(4, 2)
        lab.size = Vector2(44, 48)
        lab.add_theme_font_size_override("font_size", 10)
        sp.add_child(lab)
        var cd := Label.new()
        cd.position = Vector2(0, 14)
        cd.size = Vector2(52, 24)
        cd.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
        cd.add_theme_font_size_override("font_size", 20)
        sp.add_child(cd)
        skill_slots.append({"panel": sp, "label": lab, "cd": cd})

    # journal d'événements (bas-gauche)
    log_label = Label.new()
    log_label.size = Vector2(380, 200)
    log_label.add_theme_font_size_override("font_size", 12)
    hud_root.add_child(log_label)

    # fenêtre de dialogue (entraîneur / marchand / armurier)
    dialog = Panel.new(); dialog.size = Vector2(470, 444); dialog.visible = false
    hud_root.add_child(dialog)
    dialog_title = Label.new(); dialog_title.position = Vector2(12, 8)
    dialog_title.add_theme_font_size_override("font_size", 16)
    dialog.add_child(dialog_title)
    var dsc := ScrollContainer.new(); dsc.position = Vector2(8, 36); dsc.size = Vector2(454, 400)
    dialog.add_child(dsc)
    dialog_box = VBoxContainer.new(); dialog_box.custom_minimum_size = Vector2(438, 0)
    dsc.add_child(dialog_box)
    # fenêtre d'inventaire
    inventory_panel = Panel.new(); inventory_panel.size = Vector2(344, 462); inventory_panel.visible = false
    hud_root.add_child(inventory_panel)
    var ititle := Label.new(); ititle.text = "Inventaire (I)"; ititle.position = Vector2(12, 8)
    ititle.add_theme_font_size_override("font_size", 16)
    inventory_panel.add_child(ititle)
    var isc := ScrollContainer.new(); isc.position = Vector2(8, 36); isc.size = Vector2(328, 418)
    inventory_panel.add_child(isc)
    inventory_box = VBoxContainer.new(); inventory_box.custom_minimum_size = Vector2(312, 0)
    isc.add_child(inventory_box)

    _layout_hud()
    get_viewport().size_changed.connect(_layout_hud)

func _make_bar(parent: Control, pos: Vector2, color: Color, width := 244.0) -> Dictionary:
    var h := 16.0
    var bg := ColorRect.new()
    bg.color = Color(0.1, 0.11, 0.16)
    bg.position = pos
    bg.size = Vector2(width, h)
    parent.add_child(bg)
    var fill := ColorRect.new()
    fill.color = color
    fill.position = pos
    fill.size = Vector2(width, h)
    parent.add_child(fill)
    var lab := Label.new()
    lab.position = pos
    lab.size = Vector2(width, h)
    lab.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
    lab.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
    lab.add_theme_font_size_override("font_size", 11)
    parent.add_child(lab)
    return {"fill": fill, "label": lab, "w": width}

func _set_bar(bar: Dictionary, ratio: float, text: String) -> void:
    if bar.is_empty():
        return
    bar["fill"].size.x = bar["w"] * clampf(ratio, 0.0, 1.0)
    bar["label"].text = text

func _layout_hud() -> void:
    var vp := get_viewport().get_visible_rect().size
    if target_panel:
        target_panel.position = Vector2(vp.x * 0.5 - 115, 12)
    var total := 9 * 58.0 - 6
    var startx := vp.x * 0.5 - total * 0.5
    for i in range(skill_slots.size()):
        skill_slots[i]["panel"].position = Vector2(startx + i * 58.0, vp.y - 66)
    if log_label:
        log_label.position = Vector2(12, vp.y - 280)
    if dialog:
        dialog.position = Vector2(vp.x * 0.5 - 235, vp.y * 0.5 - 222)
    if inventory_panel:
        inventory_panel.position = Vector2(vp.x - 360, 70)

func _merge_stats(d) -> void:
    if typeof(d) != TYPE_DICTIONARY:
        return
    for k in d:
        stats[k] = d[k]

func _log(t: String) -> void:
    if t == "":
        return
    log_lines.append(t)
    while log_lines.size() > 9:
        log_lines.pop_front()
    if log_label:
        log_label.text = "\n".join(log_lines)

func _short(s: String) -> String:
    return s if s.length() <= 9 else s.substr(0, 8) + "."

func _update_hud() -> void:
    if not in_world:
        return
    var lv := int(stats.get("lvl", 1))
    lbl_ident.text = "%s — niveau %d" % [str(stats.get("name", name_edit.text)), lv]
    var hp := float(stats.get("hp", 0)); var mhp := float(stats.get("maxHp", 1))
    var pw := float(stats.get("power", 0)); var mpw := float(stats.get("maxPower", 1))
    var xp := float(stats.get("xp", 0)); var xn := float(stats.get("xpNext", 1))
    _set_bar(bar_hp, hp / maxf(mhp, 1.0), "%d / %d" % [int(hp), int(mhp)])
    _set_bar(bar_pw, pw / maxf(mpw, 1.0), "%d / %d" % [int(pw), int(mpw)])
    _set_bar(bar_xp, xp / maxf(xn, 1.0), "XP")
    lbl_gold.text = "💰 %d or" % int(stats.get("gold", 0))
    lbl_fort.text = "🏰 Fort Central : %s" % ("neutre" if fort_owner == "" else fort_owner)
    var now_ms := Time.get_unix_time_from_system() * 1000.0
    for i in range(skill_slots.size()):
        var slot = skill_slots[i]
        slot["label"].text = "%d\n%s" % [i + 1, _short(str(skill_names[i]))]
        var cdend := float(self_cooldowns.get("s%d" % i, 0))
        var rem := (cdend - now_ms) / 1000.0
        slot["cd"].text = ("%d" % int(ceil(rem))) if rem > 0.05 else ""
        var learned := i in self_learned
        slot["panel"].modulate = Color(1, 1, 1, 1) if learned else Color(0.55, 0.55, 0.55, 0.7)
    if target_id != "" and entity_info.has(target_id) and not entity_info[target_id]["dead"]:
        var ti = entity_info[target_id]
        target_panel.visible = true
        target_name.text = str(ti["name"])
        _set_bar(target_hp, float(ti["hp"]) / 100.0, "")
    else:
        target_panel.visible = false

func _target_nearest() -> void:
    var best := ""
    var bestd := 70.0
    var pp := player_node.position
    for id in entity_info:
        var info = entity_info[id]
        if info["dead"]:
            continue
        var is_enemy: bool = info["kind"] == "mob" or (info["realm"] != "" and info["realm"] != my_realm and (info["kind"] == "ai" or info["kind"] == "player"))
        if not is_enemy:
            continue
        var node: Node3D = entities.get(id, null)
        if node == null:
            continue
        var d := node.position.distance_to(pp)
        if d < bestd:
            bestd = d
            best = id
    if best != "":
        target_id = best
        _send({"type": "target", "id": best})

func _interact_nearest() -> void:
    var best := ""
    var bestd := 14.0
    for id in entity_info:
        if entity_info[id]["kind"] != "npc":
            continue
        var node: Node3D = entities.get(id, null)
        if node == null:
            continue
        var d := node.position.distance_to(player_node.position)
        if d < bestd:
            bestd = d
            best = id
    if best != "":
        _send({"type": "interact", "id": best})

# ---------- Fenêtres d'interaction (phase 3) ----------
func _rarity_color(r) -> Color:
    return RARITY_COLORS.get(str(r), Color(1, 1, 1))

func _item_text(it) -> String:
    if typeof(it) != TYPE_DICTIONARY:
        return "?"
    var parts := []
    if float(it.get("dmg", 0)) > 0:
        parts.append("Dég+%d" % int(it.get("dmg", 0)))
    if int(it.get("armor", 0)) > 0:
        parts.append("Arm+%d" % int(it.get("armor", 0)))
    var st = it.get("stats", {})
    if typeof(st) == TYPE_DICTIONARY:
        for k in st:
            parts.append("%s+%d" % [str(k), int(st[k])])
    if int(it.get("hp", 0)) > 0:
        parts.append("PV+%d" % int(it.get("hp", 0)))
    if int(it.get("power", 0)) > 0:
        parts.append("Pui+%d" % int(it.get("power", 0)))
    return "%s [niv%d] %s" % [str(it.get("name", "")), int(it.get("lvl", 1)), " ".join(PackedStringArray(parts))]

func _dialog_begin(title: String) -> void:
    dialog.visible = true
    dialog_title.text = title
    for c in dialog_box.get_children():
        c.queue_free()

func _dialog_button(text: String, cb: Callable, enabled := true, col := Color(1, 1, 1)) -> void:
    var b := Button.new()
    b.text = text
    b.disabled = not enabled
    b.add_theme_color_override("font_color", col)
    b.custom_minimum_size = Vector2(0, 30)
    if cb.is_valid():
        b.pressed.connect(cb)
    dialog_box.add_child(b)

func _close_dialog() -> void:
    dialog.visible = false

func _open_trainer(arr) -> void:
    _dialog_begin("Entraîneur — apprends tes sorts")
    var lv := int(stats.get("lvl", 1))
    var gold := int(stats.get("gold", 0))
    for e in arr:
        var slot := int(e.get("slot", 0))
        var nm := str(e.get("name", ""))
        var req := int(e.get("lvl", 1))
        var cost := int(e.get("gold", 0))
        var learned := bool(e.get("learned", false))
        if learned:
            _dialog_button("✓ %s — appris" % nm, Callable(), false, Color(0.6, 1, 0.6))
        elif lv < req:
            _dialog_button("🔒 %s — niveau %d requis" % [nm, req], Callable(), false, Color(0.6, 0.6, 0.6))
        else:
            var aff := gold >= cost
            _dialog_button("%s — %d or" % [nm, cost], Callable(self, "_on_learn").bind(slot), aff, (Color(1, 1, 1) if aff else Color(1, 0.7, 0.4)))
    _dialog_button("Fermer", Callable(self, "_close_dialog"))

func _open_shop(title, arr) -> void:
    _dialog_begin(str(title))
    var gold := int(stats.get("gold", 0))
    for it in arr:
        var price := int(it.get("price", 0))
        _dialog_button("%s — %d or" % [str(it.get("name", "")), price], Callable(self, "_on_buy").bind(str(it.get("id", ""))), gold >= price)
    _dialog_button("Fermer", Callable(self, "_close_dialog"))

func _open_armory(arr) -> void:
    _dialog_begin("Armurier")
    var gold := int(stats.get("gold", 0))
    for it in arr:
        var val := int(it.get("value", 0))
        _dialog_button("%s — %d or" % [_item_text(it), val], Callable(self, "_on_buy").bind(str(it.get("id", ""))), gold >= val, _rarity_color(it.get("rarity", "")))
    _dialog_button("Fermer", Callable(self, "_close_dialog"))

func _inv_button(text: String, cb: Callable, enabled := true, col := Color(1, 1, 1)) -> void:
    var b := Button.new()
    b.text = text
    b.disabled = not enabled
    b.add_theme_color_override("font_color", col)
    b.custom_minimum_size = Vector2(0, 28)
    if cb.is_valid():
        b.pressed.connect(cb)
    inventory_box.add_child(b)

func _refresh_inventory() -> void:
    for c in inventory_box.get_children():
        c.queue_free()
    var equip = stats.get("equip", {})
    var bag = stats.get("bag", [])
    var h := Label.new(); h.text = "— Équipé (clic = retirer) —"; inventory_box.add_child(h)
    for slot in EQUIP_SLOTS:
        var it = (equip.get(slot, null) if typeof(equip) == TYPE_DICTIONARY else null)
        if it != null:
            _inv_button("%s : %s" % [SLOT_LABELS[slot], _item_text(it)], Callable(self, "_on_unequip").bind(slot), true, _rarity_color(it.get("rarity", "")))
        else:
            _inv_button("%s : (vide)" % SLOT_LABELS[slot], Callable(), false, Color(0.6, 0.6, 0.6))
    var h2 := Label.new(); h2.text = "— Sac (clic = équiper) —"; inventory_box.add_child(h2)
    if typeof(bag) == TYPE_ARRAY:
        if bag.is_empty():
            var e := Label.new(); e.text = "(vide — tue des monstres ou visite l'armurier)"; inventory_box.add_child(e)
        for idx in range(bag.size()):
            _inv_button(_item_text(bag[idx]), Callable(self, "_on_equip").bind(idx), true, _rarity_color(bag[idx].get("rarity", "")))

func _on_learn(slot) -> void: _send({"type": "learn", "slot": slot})
func _on_buy(id) -> void: _send({"type": "buy", "id": id})
func _on_equip(idx) -> void: _send({"type": "equip", "idx": idx})
func _on_unequip(slot) -> void: _send({"type": "unequip", "slot": slot})

func _spell_fx() -> void:
    var pos := player_node.position
    if target_id != "" and entities.has(target_id):
        pos = entities[target_id].position
    var m := MeshInstance3D.new()
    var sm := SphereMesh.new(); sm.radius = 0.6; sm.height = 1.2
    m.mesh = sm
    var mat := StandardMaterial3D.new()
    mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
    mat.emission_enabled = true
    mat.emission = Color(0.5, 0.8, 1.0)
    mat.albedo_color = Color(0.5, 0.8, 1.0, 0.6)
    m.material_override = mat
    m.position = pos + Vector3(0, 2, 0)
    add_child(m)
    var tw := create_tween()
    tw.tween_property(m, "scale", Vector3(4, 4, 4), 0.4)
    tw.parallel().tween_property(mat, "albedo_color:a", 0.0, 0.4)
    tw.tween_callback(m.queue_free)

# ---------- Décor : relief, biomes, forêts (phase Godot) ----------
func _near_road(x: float, z: float) -> bool:
    for b in T_BASES:
        var l2 := b.x * b.x + b.y * b.y
        if l2 <= 0.0:
            continue
        var t := clampf((x * b.x + z * b.y) / l2, 0.0, 1.0)
        if Vector2(x - b.x * t, z - b.y * t).length() < 16.0:
            return true
    return false

func terrain_height(x: float, z: float) -> float:
    var h := sin(x * 0.006) * cos(z * 0.0055) * 15.0 + sin(x * 0.013) * cos(z * 0.011) * 6.0 + sin(x * 0.031 + z * 0.027) * 2.5
    var dc := sqrt(x * x + z * z)
    var edge := maxf(0.0, (dc - T_HALF * 0.62) / (T_HALF * 0.38))
    h += edge * edge * 130.0
    var flatten := dc
    for b in T_BASES:
        flatten = minf(flatten, Vector2(x - b.x, z - b.y).length())
    if _near_road(x, z):
        flatten = minf(flatten, 12.0)
    h *= clampf((flatten - 40.0) / 120.0, 0.0, 1.0)
    return h

func biome_at(x: float, z: float) -> String:
    if sqrt(x * x + z * z) < FRONTIER_RADIUS * 0.9:
        return "frontier"
    var best := "frontier"
    var bd := 1.0e20
    for i in range(T_BASES.size()):
        var d := Vector2(x - T_BASES[i].x, z - T_BASES[i].y).length()
        if d < bd:
            bd = d
            best = T_REALM[i]
    return best

func _ground_color(x: float, z: float, h: float) -> Color:
    var c: Color = BIOME_GROUND.get(biome_at(x, z), Color(0.4, 0.5, 0.3))
    var snow := Color(0.93, 0.95, 0.97)
    if biome_at(x, z) == "mid":
        c = c.lerp(snow, 0.45)
    if h > 34.0:
        c = c.lerp(snow, minf(0.9, (h - 34.0) / 40.0))
    return c

func _build_terrain() -> void:
    var st := SurfaceTool.new()
    st.begin(Mesh.PRIMITIVE_TRIANGLES)
    var seg := 80
    var size := 3600.0
    var step := size / seg
    var half := size * 0.5
    for gz in range(seg):
        for gx in range(seg):
            var x0 := -half + gx * step
            var z0 := -half + gz * step
            var x1 := x0 + step
            var z1 := z0 + step
            # deux triangles par cellule
            _terr_vtx(st, x0, z0); _terr_vtx(st, x1, z0); _terr_vtx(st, x1, z1)
            _terr_vtx(st, x0, z0); _terr_vtx(st, x1, z1); _terr_vtx(st, x0, z1)
    st.generate_normals()
    var mi := MeshInstance3D.new()
    mi.mesh = st.commit()
    var mat := StandardMaterial3D.new()
    mat.vertex_color_use_as_albedo = true
    mat.roughness = 1.0
    mi.material_override = mat
    add_child(mi)

func _terr_vtx(st: SurfaceTool, x: float, z: float) -> void:
    var y := terrain_height(x, z)
    st.set_color(_ground_color(x, z, y))
    st.add_vertex(Vector3(x, y, z))

func _build_scenery(arr) -> void:
    if scenery_built:
        return
    scenery_built = true
    var trees := []
    var rocks := []
    for s in arr:
        if int(s[2]) == 1:
            trees.append(s)
        else:
            rocks.append(s)
    if trees.size() > 0:
        var trunk_mm := MultiMesh.new(); trunk_mm.transform_format = MultiMesh.TRANSFORM_3D
        var cyl := CylinderMesh.new(); cyl.top_radius = 0.35; cyl.bottom_radius = 0.5; cyl.height = 6.0
        trunk_mm.mesh = cyl; trunk_mm.instance_count = trees.size()
        var canopy_mm := MultiMesh.new(); canopy_mm.transform_format = MultiMesh.TRANSFORM_3D; canopy_mm.use_colors = true
        var sph := SphereMesh.new(); sph.radius = 2.8; sph.height = 5.6
        canopy_mm.mesh = sph; canopy_mm.instance_count = trees.size()
        for i in range(trees.size()):
            var s = trees[i]
            var x := float(s[0]); var z := float(s[1]); var sc := float(s[4]); var sp := str(s[3])
            var y := terrain_height(x, z)
            trunk_mm.set_instance_transform(i, Transform3D(Basis().scaled(Vector3(sc, sc, sc)), Vector3(x, y + 3.0 * sc, z)))
            canopy_mm.set_instance_transform(i, Transform3D(Basis().scaled(Vector3(sc, sc, sc)), Vector3(x, y + 7.0 * sc, z)))
            canopy_mm.set_instance_color(i, TREE_FOLIAGE.get(sp, Color8(0x4f, 0x7a, 0x33)))
        var tmi := MultiMeshInstance3D.new(); tmi.multimesh = trunk_mm
        var tmat := StandardMaterial3D.new(); tmat.albedo_color = Color8(0x5e, 0x43, 0x27); tmat.roughness = 1.0
        tmi.material_override = tmat; add_child(tmi)
        var cmi := MultiMeshInstance3D.new(); cmi.multimesh = canopy_mm
        var cmat := StandardMaterial3D.new(); cmat.vertex_color_use_as_albedo = true; cmat.roughness = 0.95
        cmi.material_override = cmat; add_child(cmi)
    if rocks.size() > 0:
        var rock_mm := MultiMesh.new(); rock_mm.transform_format = MultiMesh.TRANSFORM_3D
        var bm := BoxMesh.new(); bm.size = Vector3(2.0, 1.6, 2.0)
        rock_mm.mesh = bm; rock_mm.instance_count = rocks.size()
        for i in range(rocks.size()):
            var s = rocks[i]
            var x := float(s[0]); var z := float(s[1]); var sc := float(s[4])
            var y := terrain_height(x, z)
            rock_mm.set_instance_transform(i, Transform3D(Basis().rotated(Vector3.UP, float(i) * 0.7).scaled(Vector3(sc, sc, sc)), Vector3(x, y + 0.6 * sc, z)))
        var rmi := MultiMeshInstance3D.new(); rmi.multimesh = rock_mm
        var rmat := StandardMaterial3D.new(); rmat.albedo_color = Color8(0x8a, 0x8f, 0x98); rmat.roughness = 1.0
        rmi.material_override = rmat; add_child(rmi)

# ---------- Boucle ----------
func _process(delta: float) -> void:
    ws.poll()
    var state := ws.get_ready_state()
    if state == WebSocketPeer.STATE_OPEN:
        if not connected:
            connected = true
            status_label.text = "Connecté — authentification…"
            _send({"type": "auth", "provider": "guest", "guestId": "godot-" + str(randi())})
        while ws.get_available_packet_count() > 0:
            _handle(ws.get_packet().get_string_from_utf8())
    elif state == WebSocketPeer.STATE_CLOSED:
        if connected:
            connected = false
            in_world = false
            status_label.text = "Déconnecté"
    if in_world:
        _update_local_player(delta)
    _interp_entities(delta)
    _update_camera()
    _update_target_bar()
    _update_hud()

func _send(d: Dictionary) -> void:
    if ws.get_ready_state() == WebSocketPeer.STATE_OPEN:
        ws.send_text(JSON.stringify(d))

func _handle(txt: String) -> void:
    var m = JSON.parse_string(txt)
    if typeof(m) != TYPE_DICTIONARY:
        return
    match str(m.get("type", "")):
        "authed":
            status_label.text = "Connecté : " + str(m.get("account", ""))
        "roster":
            if not in_world:
                my_realm = str(realm_opt.get_item_metadata(realm_opt.selected))
                var p = REALM_PRESET[my_realm]
                _send({"type": "create", "name": name_edit.text, "realm": my_realm, "cls": p["cls"], "race": p["race"]})
        "welcome":
            self_id = str(m.get("selfId", ""))
            var sp = m.get("spawn", null)
            if sp != null:
                me = Vector3(float(sp.get("x", 0)), 0, float(sp.get("z", 0)))
            me.y = terrain_height(me.x, me.z)
            player_node.position = me
            in_world = true
            player_node.visible = true
            login_panel.visible = false
            hud_root.visible = true
            if m.has("scenery"):
                _build_scenery(m["scenery"])
            status_label.text = "En jeu — ZQSD / WASD (Échap : quitter)"
        "self":
            var s = m.get("self", {})
            _merge_stats(s)
            if typeof(s) == TYPE_DICTIONARY:
                if s.has("cooldowns"): self_cooldowns = s["cooldowns"]
                if s.has("learned"): self_learned = s["learned"]
            if inventory_open:
                _refresh_inventory()
        "state":
            _apply_state(m)
            if m.has("me"): _merge_stats(m["me"])
            if m.has("fort") and typeof(m["fort"]) == TYPE_DICTIONARY:
                fort_owner = str(m["fort"].get("owner", ""))
        "event":
            _log(str(m.get("text", "")))
            if m.has("trainer"):
                for entry in m["trainer"]:
                    var sl := int(entry.get("slot", -1))
                    if sl >= 0 and sl < skill_names.size():
                        skill_names[sl] = str(entry.get("name", ""))
                _open_trainer(m["trainer"])
            if m.has("shop"):
                _open_shop("Marchand", m["shop"])
            if m.has("armory"):
                _open_armory(m["armory"])

func _apply_state(m: Dictionary) -> void:
    var arr = m.get("e", [])
    var seen := {}
    for ent in arr:
        var id := str(ent[0])
        seen[id] = true
        var kind := str(ent[1])
        var realm := str(ent[3])
        var nm := str(ent[2])
        var x := float(ent[6])
        var z := float(ent[7])
        var dead := int(ent[10]) == 1
        if not entities.has(id):
            var col: Color = REALM_COLORS.get(realm, Color(0.6, 0.6, 0.6))
            if kind == "mob":
                col = Color(0.72, 0.22, 0.16)
            elif kind == "npc":
                col = Color(0.85, 0.8, 0.4)
            var node := _make_avatar(col, kind)
            if kind == "mob":
                node.scale = Vector3(1.3, 1.3, 1.3)
            node.position = Vector3(x, terrain_height(x, z), z)
            node.set_meta("prev", node.position)
            add_child(node)
            var label := Label3D.new()
            label.text = nm
            label.position = Vector3(0, 4.0, 0)
            label.billboard = BaseMaterial3D.BILLBOARD_ENABLED
            label.no_depth_test = true
            if kind == "mob":
                label.modulate = Color(1, 0.4, 0.3)
            elif kind == "npc":
                label.modulate = Color(1, 0.87, 0.4)
            elif realm != "" and realm != my_realm:
                label.modulate = Color(1, 0.55, 0.4)
            else:
                label.modulate = Color(0.6, 0.85, 1)
            node.add_child(label)
            node.set_meta("target", Vector3(x, 0, z))
            node.set_meta("dead", dead)
            entities[id] = node
        else:
            entities[id].set_meta("target", Vector3(x, 0, z))
            entities[id].set_meta("dead", dead)
        entity_info[id] = {"kind": kind, "realm": realm, "name": nm, "hp": float(ent[9]), "dead": dead}

    for id in entities.keys():
        if not seen.has(id):
            entities[id].queue_free()
            entities.erase(id)
            entity_info.erase(id)

func _interp_entities(delta: float) -> void:
    var t := minf(1.0, delta * 10.0)
    for id in entities:
        var node: Node3D = entities[id]
        var target: Vector3 = node.get_meta("target", node.position)
        var prev: Vector3 = node.position
        node.position = node.position.lerp(target, t)
        node.position.y = terrain_height(node.position.x, node.position.z)
        var moved := node.position.distance_to(prev)
        var speed := moved / maxf(delta, 0.001)
        if moved > 0.02:
            node.rotation.y = atan2(target.x - prev.x, target.z - prev.z)
        _avatar_locomotion(node, speed, bool(node.get_meta("dead", false)))

func _update_local_player(delta: float) -> void:
    var fwd := 0.0
    var strafe := 0.0
    if Input.is_key_pressed(KEY_W) or Input.is_key_pressed(KEY_Z) or Input.is_key_pressed(KEY_UP):
        fwd += 1
    if Input.is_key_pressed(KEY_S) or Input.is_key_pressed(KEY_DOWN):
        fwd -= 1
    if Input.is_key_pressed(KEY_A) or Input.is_key_pressed(KEY_Q) or Input.is_key_pressed(KEY_LEFT):
        strafe -= 1
    if Input.is_key_pressed(KEY_D) or Input.is_key_pressed(KEY_RIGHT):
        strafe += 1
    me.y = terrain_height(me.x, me.z)
    var sp := 0.0
    if fwd != 0.0 or strafe != 0.0:
        var f := -Vector3(sin(cam_yaw), 0, cos(cam_yaw))   # avant = sens de la caméra (au sol)
        var r := f.cross(Vector3.UP)                       # droite
        var mv := (f * fwd + r * strafe).normalized()
        me += mv * MOVE_SPEED * delta
        player_node.rotation.y = atan2(mv.x, mv.z)
        sp = MOVE_SPEED
    player_node.position = player_node.position.lerp(me, minf(1.0, delta * 15.0))
    _avatar_locomotion(player_node, sp, false)
    move_accum += delta
    if move_accum > 0.1:
        move_accum = 0.0
        _send({"type": "move", "x": me.x, "z": me.z, "ry": player_node.rotation.y})

func _update_camera() -> void:
    var focus := (player_node.position if in_world else Vector3.ZERO) + Vector3(0, 2.6, 0)
    var horiz := cos(cam_pitch) * cam_dist
    var offset := Vector3(sin(cam_yaw) * horiz, sin(cam_pitch) * cam_dist, cos(cam_yaw) * horiz)
    camera.position = focus + offset
    camera.look_at(focus, Vector3.UP)

func _update_target_bar() -> void:
    if target_id != "" and entities.has(target_id) and entity_info.has(target_id) and not entity_info[target_id]["dead"]:
        var n: Node3D = entities[target_id]
        target_bar3d.visible = true
        target_bar3d.global_position = n.global_position + Vector3(0, 5.4, 0)
        var ratio := clampf(float(entity_info[target_id]["hp"]) / 100.0, 0.0, 1.0)
        target_bar_fill.scale.x = maxf(ratio, 0.001)
    else:
        target_bar3d.visible = false

func _try_click_target(mouse_pos: Vector2) -> void:
    if not in_world or dialog.visible or inventory_open:
        return
    var best := ""
    var bestd := 80.0
    for id in entities:
        var n: Node3D = entities[id]
        var wp := n.global_position + Vector3(0, 2.5, 0)
        if camera.is_position_behind(wp):
            continue
        var sp := camera.unproject_position(wp)
        var d := sp.distance_to(mouse_pos)
        if d < bestd:
            bestd = d
            best = id
    if best != "":
        target_id = best
        _send({"type": "target", "id": best})

func _input(event: InputEvent) -> void:
    if event is InputEventMouseButton:
        if event.button_index == MOUSE_BUTTON_RIGHT:
            cam_rotating = event.pressed
            Input.set_mouse_mode(Input.MOUSE_MODE_CAPTURED if event.pressed else Input.MOUSE_MODE_VISIBLE)
        elif event.button_index == MOUSE_BUTTON_WHEEL_UP and event.pressed:
            cam_dist = clampf(cam_dist - 2.0, 6.0, 45.0)
        elif event.button_index == MOUSE_BUTTON_WHEEL_DOWN and event.pressed:
            cam_dist = clampf(cam_dist + 2.0, 6.0, 45.0)
        elif event.button_index == MOUSE_BUTTON_LEFT and event.pressed:
            _try_click_target(event.position)
    elif event is InputEventMouseMotion and cam_rotating:
        cam_yaw -= event.relative.x * 0.0025
        cam_pitch = clampf(cam_pitch + event.relative.y * 0.0025, 0.06, 1.2)

func _unhandled_input(event: InputEvent) -> void:
    if not (event is InputEventKey and event.pressed and not event.echo):
        return
    var kc: int = (event as InputEventKey).keycode
    if kc == KEY_ESCAPE:
        if dialog.visible:
            _close_dialog()
        elif inventory_open:
            inventory_open = false
            inventory_panel.visible = false
        else:
            get_tree().quit()
    elif kc == KEY_I:
        inventory_open = not inventory_open
        inventory_panel.visible = inventory_open
        if inventory_open:
            _refresh_inventory()
    elif kc >= KEY_1 and kc <= KEY_9:
        _send({"type": "skill", "slot": kc - KEY_1})
        _spell_fx()
    elif kc == KEY_R:
        auto_attack = not auto_attack
        _send({"type": "attack", "on": auto_attack})
    elif kc == KEY_F:
        _target_nearest()
    elif kc == KEY_E:
        _interact_nearest()
    elif kc == KEY_T:
        _send({"type": "useitem", "id": "potion_hp"})
    elif kc == KEY_Y:
        _send({"type": "useitem", "id": "potion_pw"})
