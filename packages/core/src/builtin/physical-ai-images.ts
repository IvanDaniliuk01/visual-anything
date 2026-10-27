/**
 * The pictures of the built-in "Physical AI and robotics" package (ADR 0079): its icons, drawn for
 * Visual Anything as plain shapes on a 24-unit grid with a 2-unit stroke, each in one colour that reads
 * on its component's fill in both themes; and its two drawings with parts (ADR 0067), a six-axis arm
 * and a differential mobile robot, whose named parts the elements of a robot are drawn as, so that
 * "drives" and "senses" attach to the exact part. Every picture is stored as the core's cleaner writes
 * it, so that cleaning it again changes nothing. Tests check all of this.
 */
import type { SvgImage } from '@visual-anything/schema';
import { OWN_LICENSE, OWN_SOURCE } from './credits';

/** A picture of this package, in the cleaned SVG text given, its view box `width` by `height`. */
function picture(id: string, name: string, svg: string, width = 24, height = 24): SvgImage {
  return {
    kind: 'svg',
    id: `physical-ai.${id}`,
    name,
    source: OWN_SOURCE,
    license: OWN_LICENSE,
    width,
    height,
    svg,
  };
}

/** A robot's head, with its antenna, eyes and ears. */
export const ROBOT_ICON = picture(
  'robot-icon',
  'Robot',
  '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><rect fill="none" height="12" rx="3" stroke="#66727F" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" width="16" x="4" y="8"/><path d="M12 8V5M2 12v4M22 12v4M10 17h4" fill="none" stroke="#66727F" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/><circle cx="12" cy="3.5" fill="#66727F" r="1.5"/><circle cx="9" cy="13" fill="#66727F" r="1.5"/><circle cx="15" cy="13" fill="#66727F" r="1.5"/></svg>',
);

/** Two links on a pin, and the way they turn about it. */
export const JOINT_ICON = picture(
  'joint-icon',
  'Joint',
  '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" fill="none" r="3" stroke="#A86A00" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/><path d="M4 20l5.9-5.9M14.1 9.9L20 4" fill="none" stroke="#A86A00" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/><path d="M17.5 14.5a6 6 0 0 1-3 3" fill="none" stroke="#A86A00" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/><path d="M6.5 9.5a6 6 0 0 1 3-3" fill="none" stroke="#A86A00" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/></svg>',
);

/** A point that reads what is around it, in waves on both sides. */
export const SENSOR_ICON = picture(
  'sensor-icon',
  'Sensor',
  '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" fill="#21897C" r="2"/><path d="M8.5 8.5a4.95 4.95 0 0 0 0 7M15.5 8.5a4.95 4.95 0 0 1 0 7M5 5a9.9 9.9 0 0 0 0 14M19 5a9.9 9.9 0 0 1 0 14" fill="none" stroke="#21897C" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/></svg>',
);

/** A camera's body and its eye. */
export const CAMERA_ICON = picture(
  'camera-icon',
  'Camera',
  '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M3 9a2 2 0 0 1 2-2h2l2-3h6l2 3h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" fill="none" stroke="#21897C" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/><circle cx="12" cy="13" fill="none" r="3.5" stroke="#21897C" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/></svg>',
);

/** A stereo camera on its mount: two eyes and a projector between them. */
export const DEPTH_CAMERA_ICON = picture(
  'depth-camera-icon',
  'Depth camera',
  '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><rect fill="none" height="10" rx="3" stroke="#21897C" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" width="20" x="2" y="7"/><circle cx="7" cy="12" fill="none" r="2.5" stroke="#21897C" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/><circle cx="17" cy="12" fill="none" r="2.5" stroke="#21897C" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/><circle cx="12" cy="12" fill="#21897C" r="1"/><path d="M9 21h6M12 17v4" fill="none" stroke="#21897C" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/></svg>',
);

/** A scanning head that sends its rays all around. */
export const LIDAR_ICON = picture(
  'lidar-icon',
  'LiDAR',
  '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><rect fill="none" height="8" rx="2" stroke="#21897C" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" width="10" x="7" y="13"/><path d="M12 10V3M8 10.5L4.5 7M16 10.5L19.5 7M7 17H3M17 17h4" fill="none" stroke="#21897C" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/></svg>',
);

/** Three axes from one point: what an inertial unit measures along. */
export const IMU_ICON = picture(
  'imu-icon',
  'IMU',
  '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M12 13V5M12 13l-7 5M12 13l7 5" fill="none" stroke="#21897C" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/><circle cx="12" cy="4" fill="#21897C" r="2"/><circle cx="4" cy="19" fill="#21897C" r="2"/><circle cx="20" cy="19" fill="#21897C" r="2"/></svg>',
);

/** Two plates with a spring between them: a load cell. */
export const FORCE_TORQUE_SENSOR_ICON = picture(
  'force-torque-sensor-icon',
  'Force-torque sensor',
  '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><rect fill="#21897C" height="3" rx="1" width="16" x="4" y="3"/><rect fill="#21897C" height="3" rx="1" width="16" x="4" y="18"/><path d="M12 6v1.5l-4 2 8 2-8 2 8 2-4 2V18" fill="none" stroke="#21897C" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/></svg>',
);

/** A disc with ticks around it, read as it turns. */
export const ENCODER_ICON = picture(
  'encoder-icon',
  'Encoder',
  '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" fill="none" r="9" stroke="#21897C" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/><circle cx="12" cy="12" fill="#21897C" r="2"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M18.4 5.6l-2.1 2.1M5.6 18.4l2.1-2.1M5.6 5.6l2.1 2.1M18.4 18.4l-2.1-2.1" fill="none" stroke="#21897C" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/></svg>',
);

/** A cylinder that pushes its rod out. */
export const ACTUATOR_ICON = picture(
  'actuator-icon',
  'Actuator',
  '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><rect fill="none" height="8" rx="1.5" stroke="#C4511F" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" width="12" x="2" y="8"/><path d="M14 12h5M6 8V5h4v3" fill="none" stroke="#C4511F" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/><circle cx="20.5" cy="12" fill="#C4511F" r="1.5"/></svg>',
);

/** A motor as circuit diagrams draw one, a letter M in a circle, with its shaft. */
export const MOTOR_ICON = picture(
  'motor-icon',
  'Motor',
  '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><circle cx="11" cy="12" fill="none" r="8" stroke="#C4511F" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/><path d="M8 15V9l3 4 3-4v6M19 12h3" fill="none" stroke="#C4511F" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/></svg>',
);

/** A servo's case with its mounting tabs, and the horn on its shaft. */
export const SERVO_ICON = picture(
  'servo-icon',
  'Servo',
  '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><rect fill="none" height="11" rx="2" stroke="#C4511F" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" width="16" x="4" y="9"/><path d="M7 5h10M12 5v4M2 12v4M22 12v4" fill="none" stroke="#C4511F" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/></svg>',
);

/** Two jaws on a wrist. */
export const GRIPPER_ICON = picture(
  'gripper-icon',
  'Gripper',
  '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M5 14h14M7 14V6h3M17 14V6h-3M12 14v7" fill="none" stroke="#C4511F" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/></svg>',
);

/** Three sliders, each set to its own gain. */
export const CONTROLLER_ICON = picture(
  'controller-icon',
  'Controller',
  '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M6 4v16M12 4v16M18 4v16" fill="none" stroke="#7A5BC4" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/><circle cx="6" cy="9" fill="#7A5BC4" r="2.5"/><circle cx="12" cy="15" fill="#7A5BC4" r="2.5"/><circle cx="18" cy="7" fill="#7A5BC4" r="2.5"/></svg>',
);

/** Units of a network that end in an action. */
export const POLICY_ICON = picture(
  'policy-icon',
  'Policy',
  '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M5 7l7 5M5 17l7-5M14 12h6M17 9l3 3-3 3" fill="none" stroke="#B83F72" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/><circle cx="5" cy="7" fill="#B83F72" r="2.5"/><circle cx="5" cy="17" fill="#B83F72" r="2.5"/><circle cx="12" cy="12" fill="#B83F72" r="2.5"/></svg>',
);

/** A chip with its pins. */
export const COMPUTE_UNIT_ICON = picture(
  'compute-unit-icon',
  'Compute unit',
  '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><rect fill="none" height="12" rx="2" stroke="#64748B" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" width="12" x="6" y="6"/><rect fill="#64748B" height="4" rx="1" width="4" x="10" y="10"/><path d="M10 2v4M14 2v4M10 18v4M14 18v4M2 10h4M2 14h4M18 10h4M18 14h4" fill="none" stroke="#64748B" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/></svg>',
);

/** A terminal with its prompt: a process that runs. */
export const NODE_ICON = picture(
  'node-icon',
  'Node',
  '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><rect fill="none" height="16" rx="2" stroke="#3F7AC0" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" width="18" x="3" y="4"/><path d="M7 10l3 2-3 2M12 15h5" fill="none" stroke="#3F7AC0" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/></svg>',
);

/** Messages on their way along a channel. */
export const TOPIC_ICON = picture(
  'topic-icon',
  'Topic',
  '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M3 12h17M17 9l3 3-3 3" fill="none" stroke="#5E8A1A" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/><rect fill="#5E8A1A" height="6" rx="1" width="4" x="5" y="9"/><rect fill="#5E8A1A" height="6" rx="1" width="4" x="11" y="9"/></svg>',
);

/**
 * The named parts of the six-axis arm, in its picture's order: from the base along the chain to the
 * gripper.
 */
export const SIX_AXIS_ARM_PARTS = [
  'base',
  'joint-1',
  'link-1',
  'joint-2',
  'link-2',
  'joint-3',
  'link-3',
  'joint-4',
  'link-4',
  'joint-5',
  'link-5',
  'joint-6',
  'link-6',
  'gripper',
] as const;

/**
 * A six-axis arm seen from the side, reaching over to pick: the base and the turntable of joint 1,
 * the column of link 1, the shoulder, the upper arm straight up, the elbow, the forearm out to the
 * right with the roll collar of joint 4, the wrist, and then down: link 5, the roll collar of joint 6,
 * the tool flange and the gripper, whose body holds its name and whose jaws open toward the part
 * below. Its parts lie 6 units apart, so that the background shows between them in both themes, and
 * each is large enough to write a name such as "Joint 4" whole inside itself.
 */
export const SIX_AXIS_ARM = picture(
  'six-axis-arm',
  'Six-axis arm',
  '<svg viewBox="0 0 564 544" xmlns="http://www.w3.org/2000/svg"><path d="M40 520H200L184 480H56Z" fill="#66727F" id="base"/><rect fill="#B06F00" height="24" id="joint-1" rx="8" width="136" x="52" y="450"/><rect fill="#4A78B0" height="108" id="link-1" rx="10" width="56" x="92" y="336"/><circle cx="120" cy="294" fill="#B06F00" id="joint-2" r="36"/><rect fill="#4A78B0" height="150" id="link-2" rx="12" width="48" x="96" y="102"/><circle cx="120" cy="60" fill="#B06F00" id="joint-3" r="36"/><rect fill="#4A78B0" height="40" id="link-3" rx="12" width="160" x="162" y="40"/><rect fill="#B06F00" height="68" id="joint-4" rx="6" width="48" x="328" y="26"/><rect fill="#4A78B0" height="40" id="link-4" rx="10" width="64" x="382" y="40"/><circle cx="488" cy="60" fill="#B06F00" id="joint-5" r="36"/><rect fill="#4A78B0" height="56" id="link-5" rx="10" width="48" x="464" y="102"/><rect fill="#B06F00" height="48" id="joint-6" rx="6" width="76" x="450" y="164"/><rect fill="#4A78B0" height="32" id="link-6" rx="4" width="60" x="458" y="218"/><g fill="#C4511F" id="gripper"><rect height="40" rx="6" width="104" x="436" y="256"/><path d="M440 292H456V332H468V344H440Z"/><path d="M536 292H520V332H508V344H536Z"/></g></svg>',
  564,
  544,
);

/** The named parts of the mobile robot, in its picture's order. */
export const MOBILE_ROBOT_PARTS = [
  'chassis',
  'wheel-left',
  'wheel-right',
  'lidar',
  'camera',
  'imu',
] as const;

/**
 * A differential mobile robot seen from above, its front to the right: the chassis, with a well cut
 * 6 units around each sensor that sits on it, the LiDAR on top, the camera at the front and the IMU at
 * the back, and a wheel on each side, its left wheel at the top. Each part is large enough to write
 * its name, such as "Right wheel", whole inside itself.
 */
export const MOBILE_ROBOT = picture(
  'mobile-robot',
  'Mobile robot',
  '<svg viewBox="0 0 400 320" xmlns="http://www.w3.org/2000/svg"><path d="M96 60H304A36 36 0 0 1 340 96V224A36 36 0 0 1 304 260H96A36 36 0 0 1 60 224V96A36 36 0 0 1 96 60ZM142 160a48 48 0 1 0 96 0a48 48 0 1 0 -96 0ZM256 132H328A6 6 0 0 1 334 138V182A6 6 0 0 1 328 188H256A6 6 0 0 1 250 182V138A6 6 0 0 1 256 132ZM76 134H130A6 6 0 0 1 136 140V180A6 6 0 0 1 130 186H76A6 6 0 0 1 70 180V140A6 6 0 0 1 76 134Z" fill="#4A78B0" fill-rule="evenodd" id="chassis"/><rect fill="#66727F" height="36" id="wheel-left" rx="8" width="110" x="145" y="18"/><rect fill="#66727F" height="36" id="wheel-right" rx="8" width="110" x="145" y="266"/><circle cx="190" cy="160" fill="#21897C" id="lidar" r="42"/><rect fill="#21897C" height="44" id="camera" rx="4" width="72" x="256" y="138"/><rect fill="#21897C" height="40" id="imu" rx="4" width="54" x="76" y="140"/></svg>',
  400,
  320,
);
