"""
Blender 5.x 脚本:把多 mesh GLB 拆分成多个单 mesh GLB。

用法:
  blender --background --python tools/split_oak.py -- \
    <input.glb> <output_dir> <name_prefix>

示例:
  blender --background --python tools/split_oak.py -- \
    public/models/biomes/grassland/oak_tree.glb \
    public/models/biomes/grassland \
    oak
"""
import bpy
import os
import sys

argv = sys.argv
argv = argv[argv.index("--") + 1:] if "--" in argv else []

if len(argv) < 3:
    print("Usage: -- <input.glb> <output_dir> <name_prefix>", file=sys.stderr)
    sys.exit(1)

input_glb = argv[0]
output_dir = argv[1]
name_prefix = argv[2]

os.makedirs(output_dir, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=input_glb)

meshes = [obj for obj in bpy.context.scene.objects if obj.type == 'MESH']
print(f"[INFO] Found {len(meshes)} meshes in {input_glb}")
for m in meshes:
    print(f"       - {m.name}")

if not meshes:
    print("[ERROR] No meshes found.", file=sys.stderr)
    sys.exit(2)

for i, mesh_obj in enumerate(meshes, start=1):
    bpy.ops.object.select_all(action='DESELECT')
    mesh_obj.select_set(True)
    bpy.context.view_layer.objects.active = mesh_obj

    # 移到原点(独立摆放更方便)
    mesh_obj.location = (0.0, 0.0, 0.0)

    out_path = os.path.join(output_dir, f"{name_prefix}_{i}.glb")
    try:
        bpy.ops.export_scene.gltf(
            filepath=out_path,
            export_format='GLB',
            use_selection=True,
            export_apply=True,
            export_yup=True,
            export_materials='EXPORT',
            export_animations=False,
        )
        print(f"[OK]   {out_path}")
    except Exception as e:
        print(f"[ERROR] {out_path}: {e}", file=sys.stderr)

print(f"[DONE] Split into {len(meshes)} files")
