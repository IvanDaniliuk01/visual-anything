/**
 * The built-in "Physical AI and robotics" package (ADR 0079, R38): robots and the links and joints of
 * their kinematic chain, the sensors that read them and the world, the actuators that move them, the
 * controllers and learned policies that command those, and the software that runs it all, as nodes
 * that publish to and subscribe to topics on compute units. A robot holds its parts by "is part of",
 * and a compute unit its nodes by "runs on"; the chain itself, "is attached to", does not nest. Its
 * pictures are drawn for Visual Anything: an icon for each component but Link, whose free geometry is
 * a rounded bar (ADR 0066), and a six-axis arm and a mobile robot drawn with parts (ADR 0067), which a
 * robot shows from its own appearance and whose parts its links, joints and sensors are drawn as.
 *
 * Nodes and topics are named for what they are in any robot's software; no mark names a component.
 *
 * Once projects use these ids, they change only by additions: built-in packages have no versions yet
 * (ADR 0018).
 */
import type { AttributeDefinition, FreeGeometry, PackageFile } from '@visual-anything/schema';
import { OWN_CREDITS } from './credits';
import {
  ACTUATOR_ICON,
  CAMERA_ICON,
  COMPUTE_UNIT_ICON,
  CONTROLLER_ICON,
  DEPTH_CAMERA_ICON,
  ENCODER_ICON,
  FORCE_TORQUE_SENSOR_ICON,
  GRIPPER_ICON,
  IMU_ICON,
  JOINT_ICON,
  LIDAR_ICON,
  MOBILE_ROBOT,
  MOTOR_ICON,
  NODE_ICON,
  POLICY_ICON,
  ROBOT_ICON,
  SENSOR_ICON,
  SERVO_ICON,
  SIX_AXIS_ARM,
  TOPIC_ICON,
} from './physical-ai-images';

const RATE: AttributeDefinition = {
  name: 'rate',
  type: 'number',
  unit: 'Hz',
  description: 'How many times a second it runs.',
};

/** The outline of a link: a bar with round ends, its name and detail written between them. */
const ROUNDED_BAR: FreeGeometry = {
  width: 176,
  height: 56,
  outline: [{ kind: 'path', d: 'M28 0H148A28 28 0 0 1 148 56H28A28 28 0 0 1 28 0Z' }],
  label: { x: 20, y: 4, width: 136, height: 48 },
};

export const PHYSICAL_AI: PackageFile = {
  id: 'physical-ai',
  name: 'Physical AI and robotics',
  description:
    'Robots, their links and joints, the sensors, actuators, controllers and learned policies that move them, and the nodes and topics of their software.',
  ...OWN_CREDITS,
  components: [
    {
      id: 'physical-ai.robot',
      name: 'Robot',
      derivesFrom: 'essence',
      description:
        'A machine that senses and acts in the world, such as an arm, a mobile robot or a humanoid, holding its links, joints, sensors and actuators.',
      attributes: [
        {
          name: 'model',
          type: 'string',
          description: 'What it is, or its make and model, such as "six-axis arm".',
        },
        {
          name: 'degreesOfFreedom',
          type: 'number',
          description: 'How many independent ways it moves: one for each joint that it drives.',
        },
      ],
      appearance: {
        shape: 'rounded-rectangle',
        fill: '#F1F3F5',
        stroke: '#3E4A57',
        width: 320,
        height: 224,
        detail: { attributes: ['model'] },
        image: { image: ROBOT_ICON.id },
      },
    },
    {
      id: 'physical-ai.link',
      name: 'Link',
      derivesFrom: 'essence',
      description:
        'A rigid body of a robot, such as its base, an upper arm or a wheel, which joints join to the next.',
      attributes: [
        { name: 'mass', type: 'number', unit: 'kg', description: 'How much it weighs.' },
        {
          name: 'length',
          type: 'number',
          unit: 'm',
          description: 'How long it is, from the joint before it to the joint after it.',
        },
      ],
      appearance: {
        shape: 'rounded-rectangle',
        fill: '#DCE7F5',
        stroke: '#1F4E85',
        width: 176,
        height: 56,
        detail: { attributes: ['length', 'mass'] },
        geometry: ROUNDED_BAR,
      },
    },
    {
      id: 'physical-ai.joint',
      name: 'Joint',
      derivesFrom: 'essence',
      description:
        'Where two links meet and move against each other, turning or sliding about its axis.',
      attributes: [
        {
          name: 'kind',
          type: 'string',
          choices: ['revolute', 'prismatic', 'fixed', 'continuous'],
          description:
            'How it moves: turning between two limits, sliding, not at all, or turning without end.',
        },
        {
          name: 'lowerLimit',
          type: 'number',
          description:
            'The lowest position it reaches: an angle in degrees for a joint that turns, a distance in metres for one that slides.',
        },
        {
          name: 'upperLimit',
          type: 'number',
          description:
            'The highest position it reaches: an angle in degrees for a joint that turns, a distance in metres for one that slides.',
        },
        {
          name: 'axis',
          type: 'string',
          description:
            'The axis it turns about or slides along, in its own frame, such as "0 0 1".',
        },
        {
          name: 'position',
          type: 'number',
          default: 0,
          description:
            'Where it is now between its limits: an angle in degrees for a joint that turns, a distance in metres for one that slides. It moves everything the joint carries (ADR 0090).',
        },
      ],
      appearance: {
        shape: 'ellipse',
        fill: '#FDEBCF',
        stroke: '#8A5300',
        width: 144,
        height: 64,
        detail: { attributes: ['kind'] },
        image: { image: JOINT_ICON.id },
      },
    },
    {
      id: 'physical-ai.sensor',
      name: 'Sensor',
      derivesFrom: 'essence',
      description: 'Something that measures the robot or the world around it.',
      attributes: [
        { ...RATE, description: 'How many readings it gives a second.' },
        {
          name: 'frame',
          type: 'string',
          description: 'The frame its readings are given in, such as "camera_link".',
        },
      ],
      appearance: {
        shape: 'rounded-rectangle',
        fill: '#D9F2EC',
        stroke: '#0F6B5C',
        width: 176,
        height: 72,
        detail: { attributes: ['rate'] },
        image: { image: SENSOR_ICON.id },
      },
    },
    {
      id: 'physical-ai.camera',
      name: 'Camera',
      derivesFrom: 'physical-ai.sensor',
      description: 'A sensor that takes pictures of what it faces.',
      appearance: { image: { image: CAMERA_ICON.id } },
    },
    {
      id: 'physical-ai.depth-camera',
      name: 'Depth camera',
      derivesFrom: 'physical-ai.sensor',
      description: 'A camera that also measures how far each point it sees is.',
      appearance: { image: { image: DEPTH_CAMERA_ICON.id } },
    },
    {
      id: 'physical-ai.lidar',
      name: 'LiDAR',
      derivesFrom: 'physical-ai.sensor',
      description: 'A sensor that measures distances all around it with laser light.',
      appearance: { image: { image: LIDAR_ICON.id } },
    },
    {
      id: 'physical-ai.imu',
      name: 'IMU',
      derivesFrom: 'physical-ai.sensor',
      description: 'An inertial measurement unit: it measures how the robot accelerates and turns.',
      appearance: { image: { image: IMU_ICON.id } },
    },
    {
      id: 'physical-ai.force-torque-sensor',
      name: 'Force-torque sensor',
      derivesFrom: 'physical-ai.sensor',
      description:
        'A sensor that measures the forces and torques on what it holds, such as a tool.',
      appearance: { image: { image: FORCE_TORQUE_SENSOR_ICON.id } },
    },
    {
      id: 'physical-ai.encoder',
      name: 'Encoder',
      derivesFrom: 'physical-ai.sensor',
      description: 'A sensor that measures where a joint or a shaft is, and how fast it turns.',
      appearance: { image: { image: ENCODER_ICON.id } },
    },
    {
      id: 'physical-ai.actuator',
      name: 'Actuator',
      derivesFrom: 'essence',
      description: 'Something that moves the robot, such as a motor or a cylinder.',
      appearance: {
        shape: 'rounded-rectangle',
        fill: '#FDE4D9',
        stroke: '#9A3412',
        width: 176,
        height: 72,
        image: { image: ACTUATOR_ICON.id },
      },
    },
    {
      id: 'physical-ai.motor',
      name: 'Motor',
      derivesFrom: 'physical-ai.actuator',
      description: 'An actuator that turns a shaft.',
      attributes: [
        {
          name: 'torque',
          type: 'number',
          unit: 'N·m',
          description: 'The torque it gives at most.',
        },
      ],
      appearance: { detail: { attributes: ['torque'] }, image: { image: MOTOR_ICON.id } },
    },
    {
      id: 'physical-ai.servo',
      name: 'Servo',
      derivesFrom: 'physical-ai.actuator',
      description: 'A motor that holds the position it is given, with its own feedback inside it.',
      appearance: { image: { image: SERVO_ICON.id } },
    },
    {
      id: 'physical-ai.gripper',
      name: 'Gripper',
      derivesFrom: 'physical-ai.actuator',
      description: 'An actuator at the end of an arm that closes on what it picks up.',
      appearance: { image: { image: GRIPPER_ICON.id } },
    },
    {
      id: 'physical-ai.controller',
      name: 'Controller',
      derivesFrom: 'essence',
      description:
        'What turns a goal and the readings of sensors into commands for actuators, again and again.',
      attributes: [
        {
          name: 'kind',
          type: 'string',
          choices: ['PID', 'MPC', 'policy'],
          description:
            'How it decides: by its error and gains, by predicting over a horizon, or by a learned policy.',
        },
        RATE,
      ],
      appearance: {
        shape: 'rectangle',
        fill: '#ECE6FA',
        stroke: '#5B3B9E',
        width: 176,
        height: 72,
        detail: { attributes: ['kind', 'rate'] },
        image: { image: CONTROLLER_ICON.id },
      },
    },
    {
      id: 'physical-ai.policy',
      name: 'Policy',
      derivesFrom: 'physical-ai.controller',
      description: 'A learned controller: a model that picks the next action from what it sees.',
      attributes: [
        {
          name: 'model',
          type: 'string',
          description:
            'The model it runs, such as "a diffusion policy" or "a vision-language-action model".',
        },
      ],
      appearance: {
        fill: '#FCE4EE',
        stroke: '#8C1F4D',
        detail: { attributes: ['model'] },
        image: { image: POLICY_ICON.id },
      },
    },
    {
      id: 'physical-ai.compute-unit',
      name: 'Compute unit',
      derivesFrom: 'essence',
      description: 'A computer on or beside the robot that its software runs on.',
      attributes: [
        {
          name: 'hardware',
          type: 'string',
          description:
            'What it computes with, such as "an embedded GPU module" or "an industrial PC".',
        },
      ],
      appearance: {
        shape: 'rectangle',
        fill: '#E5EAF0',
        stroke: '#334155',
        width: 208,
        height: 88,
        detail: { attributes: ['hardware'] },
        image: { image: COMPUTE_UNIT_ICON.id },
      },
    },
    {
      id: 'physical-ai.node',
      name: 'Node',
      derivesFrom: 'essence',
      description:
        'A process of the robot’s software, such as a driver, a planner or a controller, that talks to the others through topics.',
      attributes: [
        {
          name: 'middleware',
          type: 'string',
          description: 'What it talks to the others through, such as "ROS 2", "LCM" or "ZeroMQ".',
        },
      ],
      appearance: {
        shape: 'rounded-rectangle',
        fill: '#DCEBFF',
        stroke: '#1D4F91',
        width: 176,
        height: 64,
        detail: { attributes: ['middleware'] },
        image: { image: NODE_ICON.id },
      },
    },
    {
      id: 'physical-ai.topic',
      name: 'Topic',
      derivesFrom: 'essence',
      description:
        'A named channel of messages, which some nodes publish to and others subscribe to.',
      attributes: [
        {
          name: 'messageType',
          type: 'string',
          description: 'The type of its messages, such as "Image" or "JointState".',
        },
        { ...RATE, description: 'How many messages a second it carries.' },
      ],
      appearance: {
        shape: 'rounded-rectangle',
        fill: '#EAF4D3',
        stroke: '#4A6510',
        width: 192,
        height: 56,
        detail: { attributes: ['messageType'] },
        image: { image: TOPIC_ICON.id },
      },
    },
  ],
  relationTypes: [
    {
      id: 'physical-ai.is-attached-to',
      name: 'is attached to',
      derivesFrom: 'relates-to',
      description:
        'Joins a link to the joint it moves on, a joint to the link it sits on, or a sensor to the link it is mounted on: the kinematic chain.',
      direction: 'directed',
      attributes: [
        {
          name: 'origin',
          type: 'string',
          description:
            'Where it sits on what it is attached to, as a position and a rotation, such as "xyz 0 0 0.1, rpy 0 0 0".',
        },
      ],
      appearance: { stroke: '#3D4651', width: 3 },
      limits: { to: ['physical-ai.link', 'physical-ai.joint'] },
    },
    {
      id: 'physical-ai.is-part-of',
      name: 'is part of',
      derivesFrom: 'relates-to',
      description: 'Places a link, a joint, a sensor or an actuator in the robot it belongs to.',
      direction: 'directed',
      nests: true,
      limits: { to: ['physical-ai.robot'] },
    },
    {
      id: 'physical-ai.drives',
      name: 'drives',
      derivesFrom: 'relates-to',
      description: 'Moves a joint: an actuator turns it or slides it.',
      direction: 'directed',
      appearance: { stroke: '#9A3412', width: 2 },
      limits: { from: ['physical-ai.actuator'], to: ['physical-ai.joint'] },
    },
    {
      id: 'physical-ai.senses',
      name: 'senses',
      derivesFrom: 'relates-to',
      description: 'Measures something: a link, a joint, or what is around the robot.',
      direction: 'directed',
      attributes: [
        {
          name: 'quantity',
          type: 'string',
          description: 'What it measures, such as "angle", "force" or "distance".',
        },
      ],
      appearance: { stroke: '#0F6B5C', width: 2, dash: 'dashed' },
      limits: { from: ['physical-ai.sensor'] },
    },
    {
      id: 'physical-ai.commands',
      name: 'commands',
      derivesFrom: 'relates-to',
      description:
        'Tells an actuator what to do, or a lower controller what to reach, as a policy gives a joint controller its targets.',
      direction: 'directed',
      appearance: { stroke: '#5B3B9E', width: 2 },
      limits: {
        from: ['physical-ai.controller'],
        to: ['physical-ai.controller', 'physical-ai.actuator'],
      },
    },
    {
      id: 'physical-ai.publishes-to',
      name: 'publishes to',
      derivesFrom: 'relates-to',
      description: 'Sends a node’s messages to a topic.',
      direction: 'directed',
      appearance: { stroke: '#1D4F91', width: 2 },
      limits: { from: ['physical-ai.node'], to: ['physical-ai.topic'] },
    },
    {
      id: 'physical-ai.subscribes-to',
      name: 'subscribes to',
      derivesFrom: 'relates-to',
      description: 'Has a node receive the messages of a topic.',
      direction: 'directed',
      appearance: { stroke: '#1D4F91', width: 2, dash: 'dashed' },
      limits: { from: ['physical-ai.node'], to: ['physical-ai.topic'] },
    },
    {
      id: 'physical-ai.runs-on',
      name: 'runs on',
      derivesFrom: 'relates-to',
      description: 'Places a node on the compute unit it runs on.',
      direction: 'directed',
      nests: true,
      limits: { from: ['physical-ai.node'], to: ['physical-ai.compute-unit'] },
    },
  ],
  images: [
    ROBOT_ICON,
    JOINT_ICON,
    SENSOR_ICON,
    CAMERA_ICON,
    DEPTH_CAMERA_ICON,
    LIDAR_ICON,
    IMU_ICON,
    FORCE_TORQUE_SENSOR_ICON,
    ENCODER_ICON,
    ACTUATOR_ICON,
    MOTOR_ICON,
    SERVO_ICON,
    GRIPPER_ICON,
    CONTROLLER_ICON,
    POLICY_ICON,
    COMPUTE_UNIT_ICON,
    NODE_ICON,
    TOPIC_ICON,
    SIX_AXIS_ARM,
    MOBILE_ROBOT,
  ],
};
