"""Genera las piezas del edificio, las exporta a GLB y renderiza vistas previas.

Uso (desde la raíz del repo):
    blender --background --python blender/build_models.py
    blender --background --python blender/build_models.py -- --no-render

Salida:
    assets/models/{ground,floor_a,floor_b,floor_c,roof,hook}.glb
    blender/preview/<pieza>.png, <pieza>_back.png y stack.png (torre de ejemplo)

Convenciones:
    - Todos los pisos miden W x W x H y tienen el origen abajo al centro.
    - El frente de cada pieza es la cara -Y de Blender (+Z en glTF/three.js).
    - Materiales: "pared" (el juego cambia el color), "ventana" (el juego la
      ilumina en rascacielos), "marco" (fijo). La grúa usa además "grua".
    - hook.glb tiene 3 nodos: "cable", "bloque" y "gancho". El origen de
      "gancho" está donde se une al bloque, para poder girarlo y "abrirlo".
"""

import math
import sys
from pathlib import Path

import bmesh
import bpy
from mathutils import Matrix, Vector

ROOT = Path(__file__).resolve().parent.parent
MODELS_DIR = ROOT / "assets" / "models"
PREVIEW_DIR = ROOT / "blender" / "preview"

ARGV = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
RENDER = "--no-render" not in ARGV

# ---------------------------------------------------------------- medidas ---
W = 1.0            # ancho y fondo de cada piso
H = 0.45           # alto de cada piso
SLAB_H = 0.025     # franja oscura en la base de cada piso (marca la junta)
SLAB_INSET = 0.015
RECESS = 0.035     # profundidad de las ventanas hundidas
FRAME_T = 0.018    # grosor del marco
HOOK_SCALE = 1.8   # el gancho se modela chico y se escala para que se lea junto a un piso
FACES = ("front", "right", "back", "left")

COLORS = {
    "pared": "#f2f2f0",
    "ventana": "#1d2733",
    "marco": "#3a3f47",
    "grua": "#e8b54a",
    "metal": "#b9bec4",
}
LIT_WINDOW = "#ffd27a"


# -------------------------------------------------------------- utilidades ---
def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def hex_to_linear(value):
    value = value.lstrip("#")
    srgb = [int(value[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    lin = [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in srgb]
    return (*lin, 1.0)


def principled(mat):
    return next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")


def make_material(name, color, roughness, metallic=0.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = principled(mat)
    bsdf.inputs["Base Color"].default_value = hex_to_linear(color)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    return mat


def make_materials():
    return {
        "pared": make_material("pared", COLORS["pared"], 0.85),
        "ventana": make_material("ventana", COLORS["ventana"], 0.15, 0.2),
        "marco": make_material("marco", COLORS["marco"], 0.6, 0.1),
        "grua": make_material("grua", COLORS["grua"], 0.5, 0.1),
        "metal": make_material("metal", COLORS["metal"], 0.4, 0.6),
    }


def mesh_object(name, bm, mat, collection=None, location=(0, 0, 0)):
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    if mat:
        mesh.materials.append(mat)
    obj = bpy.data.objects.new(name, mesh)
    obj.location = location
    (collection or bpy.context.scene.collection).objects.link(obj)
    return obj


def box(name, center, size, mat, collection=None):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co = Vector((v.co.x * size[0] + center[0],
                       v.co.y * size[1] + center[1],
                       v.co.z * size[2] + center[2]))
    return mesh_object(name, bm, mat, collection)


def cylinder(name, center, radius, height, mat, segments=16):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=segments,
                          radius1=radius, radius2=radius, depth=height)
    bmesh.ops.translate(bm, verts=bm.verts, vec=Vector(center))
    return mesh_object(name, bm, mat)


def join(name, objs):
    with bpy.context.temp_override(active_object=objs[0], object=objs[0],
                                   selected_objects=objs, selected_editable_objects=objs):
        bpy.ops.object.join()
    obj = objs[0]
    obj.name = name
    obj.data.name = name
    return obj


def cut(target, cutters, collection):
    """Resta todos los cortadores de `target` con un solo boolean exacto."""
    mod = target.modifiers.new("huecos", "BOOLEAN")
    mod.operation = "DIFFERENCE"
    mod.solver = "EXACT"
    mod.operand_type = "COLLECTION"
    mod.collection = collection
    mod.material_mode = "TRANSFER"
    with bpy.context.temp_override(object=target, active_object=target):
        bpy.ops.object.modifier_apply(modifier=mod.name)
    for c in cutters:
        bpy.data.objects.remove(c)
    bpy.data.collections.remove(collection)


def triangle_count(obj):
    return sum(len(p.vertices) - 2 for p in obj.data.polygons)


# ----------------------------------------------------- elementos de fachada ---
def face_point(face, u, depth, z):
    """Punto en una cara. `u` va de izquierda a derecha mirando la cara desde
    afuera; `depth` es la distancia hacia adentro desde la superficie."""
    s = W / 2 - depth
    return {
        "front": (u, -s, z),
        "back": (-u, s, z),
        "right": (s, u, z),
        "left": (-s, -u, z),
    }[face]


def face_box(name, face, u, d0, d1, z0, z1, width, mat, collection=None):
    center = face_point(face, u, (d0 + d1) / 2, (z0 + z1) / 2)
    if face in ("front", "back"):
        size = (width, d1 - d0, z1 - z0)
    else:
        size = (d1 - d0, width, z1 - z0)
    return box(name, center, size, mat, collection)


class Facade:
    """Junta las piezas de un piso y los huecos que se restan a la pared."""

    def __init__(self, mats):
        self.mats = mats
        self.parts = []
        self.cutters = []
        self.cutter_coll = bpy.data.collections.new("cortadores")
        bpy.context.scene.collection.children.link(self.cutter_coll)

    def window(self, face, u, z0, w, h, mullions=0, transom=None, door=False):
        """Ventana (o puerta) hundida: hueco + vidrio al fondo + marco perimetral."""
        m, t = self.mats["marco"], FRAME_T
        z1 = z0 + h
        # Una puerta llega hasta la base: el hueco baja un poco para no ser coplanar.
        self.cutters.append(face_box("hueco", face, u, -0.01, RECESS, z0 - (0.01 if door else 0),
                                     z1, w, self.mats["pared"], self.cutter_coll))
        self.parts.append(face_box("vidrio", face, u, RECESS - 0.008, RECESS + 0.004,
                                   z0, z1, w, self.mats["ventana"]))
        d0, d1 = 0.004, RECESS - 0.006
        self.parts += [
            face_box("marco", face, u, d0, d1, z1 - t, z1, w, m),
            face_box("marco", face, u, d0, d1, z0, z0 + t, w, m),
            face_box("marco", face, u - (w - t) / 2, d0, d1, z0, z1, t, m),
            face_box("marco", face, u + (w - t) / 2, d0, d1, z0, z1, t, m),
        ]
        for i in range(1, mullions + 1):
            mu = u - w / 2 + w * i / (mullions + 1)
            self.parts.append(face_box("parteluz", face, mu, d0 + 0.006, d1, z0, z1, t * 0.7, m))
        if transom is not None:
            zt = z0 + h * transom
            self.parts.append(face_box("travesano", face, u, d0 + 0.006, d1,
                                       zt - t * 0.35, zt + t * 0.35, w, m))

    def build(self, name, slab_inset=SLAB_INSET):
        slab_w = W - 2 * slab_inset
        self.parts.append(box("losa", (0, 0, SLAB_H / 2), (slab_w, slab_w, SLAB_H), self.mats["marco"]))
        wall = box("muro", (0, 0, (SLAB_H + H) / 2), (W, W, H - SLAB_H), self.mats["pared"])
        cut(wall, self.cutters, self.cutter_coll)
        return join(name, [wall] + self.parts)


# ------------------------------------------------------------------ piezas ---
def build_ground(mats):
    f = Facade(mats)
    # Frente: puerta doble de vidrio con marquesina y dos ventanas a los lados.
    f.window("front", 0, SLAB_H, 0.24, 0.33, mullions=1, transom=0.78, door=True)
    for u in (-0.31, 0.31):
        f.window("front", u, 0.11, 0.2, 0.24, transom=0.7)
    f.parts.append(face_box("marquesina", "front", 0, -0.09, 0.0, 0.375, 0.393, 0.36, mats["marco"]))
    # Demás caras: una ventana grande dividida en tres.
    for face in ("right", "back", "left"):
        f.window(face, 0, 0.1, 0.76, 0.28, mullions=2)
    return [f.build("ground", slab_inset=0.0)]


def build_floor_a(mats):
    f = Facade(mats)
    for face in FACES:
        for u in (-0.22, 0.22):
            f.window(face, u, 0.11, 0.28, 0.24)
    return [f.build("floor_a")]


def build_floor_b(mats):
    f = Facade(mats)
    for face in FACES:
        for u in (-0.3, 0.0, 0.3):
            f.window(face, u, 0.11, 0.2, 0.24)
    return [f.build("floor_b")]


def build_floor_c(mats):
    f = Facade(mats)
    for face in FACES:
        f.window(face, 0, 0.14, 0.86, 0.17, mullions=3)
    return [f.build("floor_c")]


def build_roof(mats):
    parts = []
    deck = 0.07           # altura de la cubierta
    pt, ph = 0.05, 0.08   # grosor y alto del pretil
    cap = 0.012
    slab_w = W - 2 * SLAB_INSET
    parts.append(box("losa", (0, 0, SLAB_H / 2), (slab_w, slab_w, SLAB_H), mats["marco"]))
    parts.append(box("cubierta", (0, 0, (SLAB_H + deck) / 2), (W, W, deck - SLAB_H), mats["pared"]))
    # Pretil perimetral con remate oscuro.
    for z0, z1, mat in ((deck, deck + ph, mats["pared"]), (deck + ph, deck + ph + cap, mats["marco"])):
        zc, hz = (z0 + z1) / 2, z1 - z0
        for s in (-1, 1):
            parts.append(box("pretil", (0, s * (W - pt) / 2, zc), (W, pt, hz), mat))
            parts.append(box("pretil", (s * (W - pt) / 2, 0, zc), (pt, W - 2 * pt, hz), mat))
    inner = W - 2 * pt
    parts.append(box("piso_azotea", (0, 0, deck + 0.002), (inner, inner, 0.004), mats["marco"]))
    # Cuarto de máquinas con puerta al frente.
    rx, ry, rw, rd, rh = -0.17, 0.14, 0.34, 0.28, 0.2
    parts.append(box("cuarto", (rx, ry, deck + rh / 2), (rw, rd, rh), mats["pared"]))
    parts.append(box("techo_cuarto", (rx, ry, deck + rh + 0.01), (rw + 0.04, rd + 0.04, 0.02), mats["marco"]))
    parts.append(box("puerta", (rx + 0.06, ry - rd / 2 - 0.004, deck + 0.075), (0.1, 0.008, 0.15), mats["marco"]))
    # Tinaco sobre una base.
    tx, ty = 0.22, 0.17
    parts.append(box("base_tinaco", (tx, ty, deck + 0.015), (0.2, 0.2, 0.03), mats["marco"]))
    parts.append(cylinder("tinaco", (tx, ty, deck + 0.03 + 0.065), 0.085, 0.13, mats["metal"]))
    parts.append(cylinder("tapa", (tx, ty, deck + 0.03 + 0.13 + 0.008), 0.05, 0.016, mats["marco"], 12))
    return [join("roof", parts)]


def hook_mesh(radius, thick, shank_top, pivot, segments=14):
    """Gancho en J: arco de tubo cuadrado + caña recta. Coordenadas relativas a `pivot`."""
    bm = bmesh.new()
    cz = radius + thick / 2
    h = thick / 2
    sections = []
    for i in range(segments + 1):
        a = math.radians(180 + 200 * i / segments)
        radial = Vector((math.cos(a), 0, math.sin(a)))
        center = Vector((radius * math.cos(a), 0, cz + radius * math.sin(a)))
        y = Vector((0, 1, 0))
        ring = [center + radial * sr * h + y * sy * h for sr, sy in ((1, 1), (-1, 1), (-1, -1), (1, -1))]
        sections.append([bm.verts.new(p - pivot) for p in ring])
    for a, b in zip(sections, sections[1:]):
        for k in range(4):
            bm.faces.new((a[k], a[(k + 1) % 4], b[(k + 1) % 4], b[k]))
    bm.faces.new(sections[0])
    bm.faces.new(list(reversed(sections[-1])))
    # Caña: del inicio del arco hasta el bloque.
    shank = bmesh.ops.create_cube(bm, size=1.0)["verts"]
    length = shank_top - cz
    for v in shank:
        v.co = Vector((v.co.x * thick - radius, v.co.y * thick, v.co.z * length + cz + length / 2)) - pivot
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return bm


def build_hook(mats):
    radius, thick = 0.045, 0.026
    shank_top = radius + thick / 2 + 0.07
    pivot = Vector((-radius, 0, shank_top))
    gancho = mesh_object("gancho", hook_mesh(radius, thick, shank_top, pivot), mats["marco"], location=pivot)
    block_h = 0.11
    bloque = join("bloque", [
        box("bloque", (0, 0, shank_top + block_h / 2), (0.13, 0.08, block_h), mats["grua"]),
        box("eje", (0, 0, shank_top + block_h * 0.6), (0.145, 0.095, 0.03), mats["marco"]),
    ])
    cable_len = 0.22
    cable = cylinder("cable", (0, 0, shank_top + block_h + cable_len / 2), 0.008, cable_len, mats["marco"], 8)
    parts = [cable, bloque, gancho]
    for o in parts:
        o.data.transform(Matrix.Scale(HOOK_SCALE, 4))
        o.location *= HOOK_SCALE
    return parts


PIECES = {
    "ground": (build_ground, 0.22, 1.9),
    "floor_a": (build_floor_a, 0.22, 1.9),
    "floor_b": (build_floor_b, 0.22, 1.9),
    "floor_c": (build_floor_c, 0.22, 1.9),
    "roof": (build_roof, 0.15, 1.9),
    "hook": (build_hook, 0.4, 1.35),
}


# ----------------------------------------------------------------- exportar ---
def export_glb(name, objs):
    for o in bpy.context.scene.objects:
        o.select_set(o in objs)
    path = MODELS_DIR / f"{name}.glb"
    bpy.ops.export_scene.gltf(
        filepath=str(path), export_format="GLB", use_selection=True, export_apply=True,
        export_yup=True, export_materials="EXPORT", export_cameras=False, export_lights=False,
    )
    tris = sum(triangle_count(o) for o in objs)
    print(f"[build_models] {path.name}: {path.stat().st_size / 1024:.1f} KB, {tris} triángulos")
    return path


# ------------------------------------------------------------ vista previa ---
def setup_preview_env(res=(800, 800)):
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 32
    scene.cycles.use_denoising = True
    scene.render.resolution_x, scene.render.resolution_y = res
    scene.render.resolution_percentage = 100
    scene.view_settings.view_transform = "Standard"

    world = bpy.data.worlds.new("mundo")
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = hex_to_linear("#dfe4ea")
    bg.inputs["Strength"].default_value = 0.6
    scene.world = world

    box("suelo", (0, 0, -0.005), (30, 30, 0.01), make_material("suelo", "#aab3bd", 0.9))

    sun_data = bpy.data.lights.new("sol", "SUN")
    sun_data.energy = 2.2
    sun_data.angle = math.radians(8)
    sun = bpy.data.objects.new("sol", sun_data)
    sun.rotation_euler = (math.radians(40), 0, math.radians(30))
    scene.collection.objects.link(sun)

    cam_data = bpy.data.cameras.new("camara")
    cam_data.type = "ORTHO"
    cam = bpy.data.objects.new("camara", cam_data)
    scene.collection.objects.link(cam)
    scene.camera = cam
    return cam


def render_view(cam, target, scale, direction, path):
    target = Vector(target)
    d = Vector(direction).normalized()
    cam.location = target + d * 20
    cam.rotation_euler = (-d).to_track_quat("-Z", "Y").to_euler()
    cam.data.ortho_scale = scale
    cam.data.clip_end = 100
    bpy.context.scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)
    print(f"[build_models] render: {path.relative_to(ROOT)}")


FRONT_VIEW = (0.75, -1.0, 0.65)
BACK_VIEW = (-0.75, 1.0, 0.65)


def render_piece(name, center_z, scale):
    cam = setup_preview_env()
    render_view(cam, (0, 0, center_z), scale, FRONT_VIEW, PREVIEW_DIR / f"{name}.png")
    render_view(cam, (0, 0, center_z), scale, BACK_VIEW, PREVIEW_DIR / f"{name}_back.png")


def import_glb(name, z):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=str(MODELS_DIR / f"{name}.glb"))
    objs = [o for o in bpy.data.objects if o not in before]
    for o in objs:
        if o.parent is None:
            o.location.z += z
    return objs


def recolor(objs, wall, lit):
    for o in objs:
        for slot in getattr(o, "material_slots", []):
            if slot.material is None:
                continue
            base = slot.material.name.split(".")[0]
            if base == "pared":
                slot.material = slot.material.copy()
                principled(slot.material).inputs["Base Color"].default_value = hex_to_linear(wall)
            elif base == "ventana" and lit:
                slot.material = slot.material.copy()
                bsdf = principled(slot.material)
                bsdf.inputs["Emission Color"].default_value = hex_to_linear(LIT_WINDOW)
                bsdf.inputs["Emission Strength"].default_value = 2.0


def render_stack():
    """Torre de ejemplo con las paletas de los 3 niveles, armada con los GLB exportados."""
    reset_scene()
    stack = [
        ("ground", "#d9c7a7", False),
        ("floor_a", "#f2f2f0", False),
        ("floor_b", "#c9cdd2", False),
        ("floor_c", "#8a9099", False),
        ("floor_a", "#5b6b7f", False),
        ("floor_b", "#2f4a66", True),
        ("floor_c", "#3a3f47", True),
        ("roof", "#a7adb5", False),
    ]
    z = 0.0
    for name, wall, lit in stack:
        recolor(import_glb(name, z), wall, lit)
        z += H
    # Un piso colgando del gancho sobre la torre.
    hanging_z = z + 0.35
    recolor(import_glb("floor_a", hanging_z), "#a7adb5", True)
    import_glb("hook", hanging_z + H + 0.03)

    top = hanging_z + H + 0.5
    cam = setup_preview_env(res=(900, 1400))
    render_view(cam, (0, 0, top / 2), top * 1.05, FRONT_VIEW, PREVIEW_DIR / "stack.png")


# -------------------------------------------------------------------- main ---
def main():
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    PREVIEW_DIR.mkdir(parents=True, exist_ok=True)
    for name, (build, center_z, scale) in PIECES.items():
        reset_scene()
        objs = build(make_materials())
        export_glb(name, objs)
        if RENDER:
            render_piece(name, center_z, scale)
    if RENDER:
        render_stack()
    print("[build_models] listo")


main()
