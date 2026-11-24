/*
 * Animation state machine of the player character. One state at a time, chosen by priority so that
 * conflicting actions cannot overlap (no running while seated, no eating while riding, standing still
 * while interacting), with the time spent in the state kept for blending and one-shot gestures.
 */
export type AnimState =
  | 'IDLE' | 'WALK' | 'RUN' | 'SPRINT'
  | 'SIT_DOWN' | 'SITTING' | 'STAND_UP' | 'EATING' | 'DRINKING'
  | 'TALKING' | 'WAVING' | 'USING_PHONE' | 'INTERACTING'
  | 'RIDING' | 'DRIVING' | 'PASSENGER';

export type AnimContext = {
  speed: number; // m/s on foot
  sitBlend: number; // 0 standing … 1 seated (damped)
  seated: boolean; // has a seat
  onScooter: boolean; // riding own scooter (driver)
  pillion: boolean; // passenger on an Đen SM bike
  inCar: boolean; // passenger in an Đen SM car
  meal: 'bite' | 'pour' | 'sip' | null; // current meal action while eating
  ordering: boolean; // seated with the menu open
  dialog: boolean; // talking with an NPC
  dialogAge: number; // seconds since the dialog opened
  phone: boolean;
  interactAge: number; // seconds since the last E press
};

/** Walking speeds that separate the locomotion states (m/s). */
export const GAIT = { idle: 0.3, run: 4.6, sprint: 6.6 };

export function resolveAnimState(c: AnimContext): AnimState {
  if (c.inCar || c.pillion) return 'PASSENGER';
  if (c.onScooter) return 'RIDING';
  if (c.seated) {
    if (c.sitBlend < 0.92) return 'SIT_DOWN';
    if (c.meal === 'bite') return 'EATING';
    if (c.meal === 'pour' || c.meal === 'sip') return 'DRINKING';
    if (c.ordering) return 'INTERACTING';
    return 'SITTING';
  }
  if (c.sitBlend > 0.05) return 'STAND_UP';
  if (c.dialog) return c.dialogAge < 1.4 ? 'WAVING' : 'TALKING';
  if (c.speed >= GAIT.idle) return c.speed >= GAIT.sprint ? 'SPRINT' : c.speed >= GAIT.run ? 'RUN' : 'WALK';
  if (c.phone) return 'USING_PHONE';
  if (c.interactAge < 0.6) return 'INTERACTING';
  return 'IDLE';
}

/** The machine: current state, the previous one and the time spent in the current one. */
export class AnimMachine {
  state: AnimState = 'IDLE';
  prev: AnimState = 'IDLE';
  t = 0;
  update(c: AnimContext, dt: number) {
    const next = resolveAnimState(c);
    if (next !== this.state) { this.prev = this.state; this.state = next; this.t = 0; } else this.t += dt;
    return this.state;
  }
}
