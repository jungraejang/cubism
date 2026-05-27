import * as THREE from "three";

const vertexShader = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vViewDir;

  void main() {
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vViewDir = normalize(-mvPosition.xyz);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const fragmentShader = /* glsl */ `
  uniform float uTime;
  uniform vec3 uColor;
  uniform float uIntensity;
  uniform float uOpacity;

  varying vec3 vNormal;
  varying vec3 vViewDir;

  void main() {
    // Fresnel rim glow: brighter at glancing angles, darker face-on.
    float fresnel = pow(1.0 - max(dot(vNormal, vViewDir), 0.0), 2.0);
    float rim = 0.45 + fresnel * 1.4;

    // Screen-space scanlines scroll slowly down the visible frame.
    float scan = 0.5 + 0.5 * sin(gl_FragCoord.y * 0.6 + uTime * 4.0);
    scan = mix(0.75, 1.05, scan);

    // Low-frequency flicker on alpha so the whole hologram pulses irregularly.
    float flicker = 0.92 + 0.08 *
      (sin(uTime * 1.7) + sin(uTime * 3.1) * 0.5);

    vec3 color = uColor * uIntensity * rim * scan;
    float alpha = uOpacity * flicker;

    gl_FragColor = vec4(color, alpha);
  }
`;

export type HologramMaterialOptions = {
  color?: THREE.ColorRepresentation;
  intensity?: number;
  opacity?: number;
};

/**
 * Creates a hologram-style ShaderMaterial: cyan emissive base with a fresnel
 * rim, screen-space scanlines, and a low-frequency alpha flicker. Drive
 * `uniforms.uTime.value` from a useFrame loop.
 */
export function createHologramMaterial(
  options: HologramMaterialOptions = {},
): THREE.ShaderMaterial {
  const {
    color = "#67e8f9",
    intensity = 1.3,
    opacity = 1.0,
  } = options;

  return new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(color) },
      uIntensity: { value: intensity },
      uOpacity: { value: opacity },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}
