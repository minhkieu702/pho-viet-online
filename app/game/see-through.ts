/**
 * Camera occlusion for the giant mutants: when one stands between the camera and the player, its figure (and its
 * growths) is dithered away in a circle around the player, nearer the camera than the player only, so the player, the
 * slam ring and the swipe cone stay readable (mutants.ts xray() opens and closes the hole each frame).
 * SEE_THROUGH.hole = (x, y of the player in framebuffer pixels, the circle's radius in pixels, the player's view depth);
 * SEE_THROUGH.on = 0..1 (the dither's share, faded in and out).
 */
import * as THREE from 'three';

export const SEE_THROUGH = { hole: { value: new THREE.Vector4() }, on: { value: 0 } };

/** Adds the hole to a MeshStandardMaterial-based material (its own program variant: `<key>-xray`). */
export function seeThrough<T extends THREE.Material>(material: T): T {
  const base = material.onBeforeCompile.bind(material), key = material.customProgramCacheKey.bind(material);
  material.onBeforeCompile = (shader, renderer) => {
    base(shader, renderer);
    shader.uniforms.uHole = SEE_THROUGH.hole;
    shader.uniforms.uHoleOn = SEE_THROUGH.on;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec4 uHole;\nuniform float uHoleOn;')
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
	if (uHoleOn > 0.0 && vViewPosition.z < uHole.w) {
		float holeK = 1.0 - length(gl_FragCoord.xy - uHole.xy) / uHole.z;
		if (holeK > 0.0 && fract(dot(floor(gl_FragCoord.xy), vec2(0.7548777, 0.5698403))) < uHoleOn * smoothstep(0.0, 0.45, holeK)) discard;
	}`);
  };
  material.customProgramCacheKey = () => `${key()}-xray`;
  return material;
}
