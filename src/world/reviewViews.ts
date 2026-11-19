import { bridgeEnds, templeCenter, turtleCenter } from './geo';

type CameraPose = { eye: [number, number, number]; target: [number, number, number] };
const [tx, tz] = turtleCenter;
const [nx, nz] = templeCenter;
const [bx, bz] = bridgeEnds[1];

// Fixed starting poses for matched WebGL captures. The regular drone controls
// remain active once the camera reaches the selected pose.
const views = new Map<string, CameraPose>([
  ['tower', { eye: [tx + 20, 7, tz + 18], target: [tx, 3.3, tz] }],
  ['temple', { eye: [bx + 17, 6, bz + 1.7], target: [nx, 3.1, nz] }],
  ['lake', { eye: [236, 155, -42], target: [0, 0, -56] }],
]);

const params = new URLSearchParams(window.location.search);
export const reviewPose = params.get('assetDebug') === '1' ? views.get(params.get('view') ?? '') : undefined;
