import * as THREE from 'three';

export const HORIZON = '#dce7e6';

/** Gradient sky dome, a soft sun and drifting clouds. Four draw calls, none of them affected by fog. */
export function createSky(scene: THREE.Scene) {
  const root = new THREE.Group();
  root.name = 'Sky';
  scene.add(root);
  const dome = new THREE.SphereGeometry(270, 32, 16);
  const top = new THREE.Color('#6fa6dc'), mid = new THREE.Color('#a9cbe6'), low = new THREE.Color(HORIZON);
  const colors: number[] = [];
  const position = dome.attributes.position;
  const c = new THREE.Color();
  for (let i = 0; i < position.count; i++) {
    const h = position.getY(i) / 270;
    if (h < 0) c.copy(low);
    else if (h < 0.25) c.copy(low).lerp(mid, h / 0.25);
    else c.copy(mid).lerp(top, Math.min(1, (h - 0.25) / 0.6));
    colors.push(c.r, c.g, c.b);
  }
  dome.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  const domeMaterial = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false });
  const sky = new THREE.Mesh(dome, domeMaterial);
  sky.renderOrder = -10;
  root.add(sky);

  const sunCanvas = document.createElement('canvas');
  sunCanvas.width = sunCanvas.height = 128;
  const sctx = sunCanvas.getContext('2d')!;
  const glow = sctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  glow.addColorStop(0, 'rgba(255,250,228,1)');
  glow.addColorStop(0.18, 'rgba(255,244,205,0.95)');
  glow.addColorStop(0.4, 'rgba(255,226,170,0.25)');
  glow.addColorStop(1, 'rgba(255,226,170,0)');
  sctx.fillStyle = glow;
  sctx.fillRect(0, 0, 128, 128);
  const sunTexture = new THREE.CanvasTexture(sunCanvas);
  sunTexture.colorSpace = THREE.SRGBColorSpace;
  const sunMaterial = new THREE.SpriteMaterial({ map: sunTexture, fog: false, depthWrite: false, transparent: true });
  const sun = new THREE.Sprite(sunMaterial);
  sun.scale.setScalar(70);
  root.add(sun);

  const cloudCanvas = document.createElement('canvas');
  cloudCanvas.width = 256;
  cloudCanvas.height = 128;
  const cctx = cloudCanvas.getContext('2d')!;
  for (let i = 0; i < 14; i++) {
    const x = 40 + Math.random() * 176, y = 50 + Math.random() * 40, r = 18 + Math.random() * 26;
    const g = cctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,0.9)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    cctx.fillStyle = g;
    cctx.beginPath();
    cctx.arc(x, y, r, 0, Math.PI * 2);
    cctx.fill();
  }
  const cloudTexture = new THREE.CanvasTexture(cloudCanvas);
  cloudTexture.colorSpace = THREE.SRGBColorSpace;
  const cloudGeometry = new THREE.PlaneGeometry(1, 0.5).rotateX(Math.PI / 2);
  const cloudMaterial = new THREE.MeshBasicMaterial({ map: cloudTexture, transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide, opacity: 0.85 });
  const CLOUDS = 18;
  const clouds = new THREE.InstancedMesh(cloudGeometry, cloudMaterial, CLOUDS);
  clouds.frustumCulled = false;
  clouds.renderOrder = -9;
  root.add(clouds);
  const cloudData = Array.from({ length: CLOUDS }, (_, i) => ({ x: (i * 97) % 500 - 250, z: (i * 61) % 500 - 250, y: 95 + (i % 5) * 12, size: 70 + (i * 37) % 80 }));
  const matrix = new THREE.Matrix4();
  const quat = new THREE.Quaternion();
  const pos = new THREE.Vector3();
  const size = new THREE.Vector3();

  return {
    /**
     * `sunDirection` is the normalised direction toward the sun (matches the directional light),
     * `tint` multiplies the dome colours (dusk, night, rain) and `cover` 0..1 thickens and greys the clouds.
     */
    update(camera: THREE.Camera, time: number, sunDirection: THREE.Vector3, tint: THREE.Color, cover: number, sunGlow: number) {
      root.position.set(camera.position.x, 0, camera.position.z);
      sun.position.copy(sunDirection).multiplyScalar(240);
      sun.visible = sunDirection.y > -0.08 && sunGlow > 0.02;
      sunMaterial.opacity = sunGlow;
      domeMaterial.color.copy(tint);
      cloudMaterial.color.copy(tint).lerp(new THREE.Color('#6d7378'), cover * 0.6);
      cloudMaterial.opacity = 0.55 + cover * 0.4;
      cloudData.forEach((cloud, i) => {
        // Clouds drift slowly and wrap around the dome.
        const x = ((cloud.x + time * 1.6 + 250) % 500 + 500) % 500 - 250;
        matrix.compose(pos.set(x, cloud.y, cloud.z), quat, size.set(cloud.size, 1, cloud.size));
        clouds.setMatrixAt(i, matrix);
      });
      clouds.instanceMatrix.needsUpdate = true;
    },
    dispose() {
      scene.remove(root);
      dome.dispose();
      domeMaterial.dispose();
      sunTexture.dispose();
      sunMaterial.dispose();
      cloudTexture.dispose();
      cloudGeometry.dispose();
      cloudMaterial.dispose();
      clouds.dispose();
    },
  };
}
