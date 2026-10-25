import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";

export const GLB_PATH = resolve(__dirname, "../../public/models/tuck.glb");

/** the GLB's JSON chunk (no decoding) */
export function glbJson(bytes = readFileSync(GLB_PATH)) {
  const len = bytes.readUInt32LE(12);
  return JSON.parse(bytes.subarray(20, 20 + len).toString("utf8"));
}

/**
 * Parse the real tuck.glb in node with three's GLTFLoader. Images need a browser, so textures are
 * stripped from a copy in memory; meshes, morph targets, extras and clips are untouched.
 */
export function loadTuckGlb(): Promise<GLTF> {
  const bytes = readFileSync(GLB_PATH);
  const json = glbJson(bytes);
  const jsonLen = bytes.readUInt32LE(12);
  const bin = bytes.subarray(20 + jsonLen + 8);
  delete json.images; delete json.textures; delete json.samplers;
  for (const m of json.materials ?? []) {
    delete m.pbrMetallicRoughness?.baseColorTexture;
    delete m.pbrMetallicRoughness?.metallicRoughnessTexture;
    delete m.normalTexture; delete m.emissiveTexture; delete m.occlusionTexture;
    for (const ext of Object.values(m.extensions ?? {}) as Record<string, unknown>[])
      for (const k of Object.keys(ext)) if (k.endsWith("Texture")) delete ext[k];
  }
  let js = Buffer.from(JSON.stringify(json), "utf8");
  js = Buffer.concat([js, Buffer.alloc((4 - (js.length % 4)) % 4, 0x20)]);
  const out = Buffer.alloc(12 + 8 + js.length + 8 + bin.length);
  out.writeUInt32LE(0x46546c67, 0); out.writeUInt32LE(2, 4); out.writeUInt32LE(out.length, 8);
  out.writeUInt32LE(js.length, 12); out.writeUInt32LE(0x4e4f534a, 16); js.copy(out, 20);
  out.writeUInt32LE(bin.length, 20 + js.length); out.writeUInt32LE(0x004e4942, 24 + js.length); bin.copy(out, 28 + js.length);
  const ab = out.buffer.slice(out.byteOffset, out.byteOffset + out.length);
  return new GLTFLoader().parseAsync(ab, "");
}
