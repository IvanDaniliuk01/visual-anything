/** Physical space (ADR 0076): poses, what is in physical space under a root, and their maths. */
// The maths, by name under `spaceMath`; the degrees the inspector and Claude's tools take, alone.
export * as spaceMath from './math';
export { NO_ROTATION, degreesOfRotation, rotationFromDegrees } from './math';
export {
  MAX_POSE_COORDINATE,
  ROTATION_TOLERANCE,
  checkedPose,
  poseIsUsable,
  poseValueProblem,
  poseWarnings,
} from './pose';
export { pointInSpace, poseIn, spaceOf, type Space, type SpaceEntry, type SpaceHow } from './space';
export {
  ATTACHED_TO,
  JOINT_COMPONENT,
  attachmentsOf,
  axisOf,
  isJoint,
  jointMotionOf,
  kinematicsWarnings,
  motionMatrix,
  type JointMotion,
} from './kinematics';
