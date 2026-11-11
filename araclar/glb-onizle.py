# GLB önizleme: her dosyanın dünya-uzayı ölçüsünü (metre) yazar ve 3/4 açıdan küçük bir görüntü çıkarır.
#   blender -b -P araclar/glb-onizle.py -- <klasör> [çıktı klasörü]
# Çıktı: <çıktı>/<ad>.png ve <çıktı>/olculer.json ({ad: {boyut:[x,y,z] (Blender: z yukarı), ucgen}}).
import bpy, sys, os, json, math
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:]
klasor = os.path.abspath(argv[0])
cikti = os.path.abspath(argv[1]) if len(argv) > 1 else os.path.join(klasor, "_onizleme")
os.makedirs(cikti, exist_ok=True)
olculer = {}

for dosya in sorted(f for f in os.listdir(klasor) if f.lower().endswith(".glb")):
    ad = os.path.splitext(dosya)[0]
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=os.path.join(klasor, dosya))
    aglar = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    mn = Vector((1e9, 1e9, 1e9)); mx = Vector((-1e9, -1e9, -1e9)); ucgen = 0
    for o in aglar:
        ucgen += sum(len(p.vertices) - 2 for p in o.data.polygons)
        for k in o.bound_box:
            w = o.matrix_world @ Vector(k)
            mn = Vector(map(min, mn, w)); mx = Vector(map(max, mx, w))
    boyut = mx - mn; merkez = (mn + mx) / 2
    olculer[ad] = {"boyut": [round(v, 2) for v in boyut], "taban": round(mn.z, 2), "ucgen": ucgen}
    r = max(boyut) * 1.25
    kam_veri = bpy.data.cameras.new("k"); kam = bpy.data.objects.new("k", kam_veri); bpy.context.scene.collection.objects.link(kam)
    kam.location = merkez + Vector((r * 0.9, -r * 1.1, r * 0.55))
    kam.rotation_euler = (merkez - kam.location).to_track_quat("-Z", "Y").to_euler()
    kam_veri.clip_start = r / 200; kam_veri.clip_end = r * 20
    s = bpy.context.scene; s.camera = kam
    # Cycles (CPU): başsız çalışmada Workbench/EEVEE ekran kartı bağlamı ister ve sessizce çizmez
    s.render.engine = "CYCLES"; s.cycles.samples = 10; s.cycles.use_denoising = False; s.cycles.max_bounces = 2
    dunya = bpy.data.worlds.new("d"); s.world = dunya; dunya.use_nodes = True
    dunya.node_tree.nodes["Background"].inputs[0].default_value = (0.75, 0.82, 1, 1); dunya.node_tree.nodes["Background"].inputs[1].default_value = 1.0
    gunes = bpy.data.objects.new("g", bpy.data.lights.new("g", "SUN")); gunes.data.energy = 3; gunes.rotation_euler = (0.9, 0, 0.6); s.collection.objects.link(gunes)
    s.render.resolution_x = 400; s.render.resolution_y = 300
    s.render.filepath = os.path.join(cikti, ad + ".png")
    bpy.ops.render.render(write_still=True)
    print("OLCU", ad, olculer[ad])

json.dump(olculer, open(os.path.join(cikti, "olculer.json"), "w"), indent=1)
