# Sketchfab GLB'lerini oynatıcıya hazırlar: dönüşümleri uygular, gerçek ölçüye getirir, tabanı y=0'a ve yatayda
# ortaya alır, GLB olarak yazar.   blender -b -P araclar/sketchfab-hazirla.py -- araclar/sketchfab-modelleri.json [ad ...]
import bpy, sys, os, json
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:]
kok = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
yap = json.load(open(os.path.join(kok, argv[0]), encoding="utf-8"))
secili = set(argv[1:])

def sinir(aglar):
    mn = Vector((1e9, 1e9, 1e9)); mx = Vector((-1e9, -1e9, -1e9))
    for o in aglar:
        for k in o.bound_box:
            w = o.matrix_world @ Vector(k)
            mn = Vector(map(min, mn, w)); mx = Vector(map(max, mx, w))
    return mn, mx

for m in yap["modeller"]:
    ad = m["ad"]
    if secili and ad not in secili: continue
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=os.path.join(kok, m.get("ham", yap["ham"]), ad + ".glb"))
    aglar = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    # Hiyerarşiyi çöz (dünya dönüşümü kalsın), boş düğümleri at: tek düzeyde ağlar
    for o in aglar:
        w = o.matrix_world.copy(); o.parent = None; o.matrix_world = w
    for o in [o for o in bpy.context.scene.objects if o.type != "MESH"]: bpy.data.objects.remove(o)
    bpy.context.view_layer.update()
    mn, mx = sinir(aglar); boyut = mx - mn
    olcek = 1.0
    if "boy" in m:
        olcu = boyut.z if m.get("eksen") == "yukseklik" else max(boyut.x, boyut.y)
        olcek = m["boy"] / olcu
    merkez = Vector(((mn.x + mx.x) / 2, (mn.y + mx.y) / 2, mn.z))
    for o in aglar:
        o.matrix_world.translation = (o.matrix_world.translation - merkez) * olcek
        o.scale = o.scale * olcek
    bpy.context.view_layer.update()
    for o in aglar: o.select_set(True)
    bpy.context.view_layer.objects.active = aglar[0]
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    mn, mx = sinir(aglar)
    cikti = os.path.join(kok, yap["cikti"].replace("{ad}", ad))
    os.makedirs(os.path.dirname(cikti), exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=cikti, export_format="GLB", export_image_format="AUTO", export_apply=True, export_yup=True)
    b = mx - mn
    print("HAZIR", ad, "en(x) %.2f  derinlik(z) %.2f  yukseklik %.2f  %.1f MB" % (b.x, b.y, b.z, os.path.getsize(cikti) / 1e6))
