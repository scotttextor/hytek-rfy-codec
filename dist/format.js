/**
 * RFY document types. A decoded RFY file flattens to:
 *   RfyDocument
 *     project: RfyProject
 *       plans: RfyPlan[]
 *         frames: RfyFrame[]
 *           sticks: RfyStick[]
 *             tooling: RfyToolingOp[]
 *
 * Ground truth: decrypted FRAMECAD schedule XML (observed 2026-04-24).
 */
export const STICK_TYPES = ["stud", "plate"];
/** All tool types observed in FrameCAD XML output. */
export const TOOL_TYPES = [
    "Bolt",
    "Chamfer",
    "InnerDimple",
    "InnerNotch",
    "InnerService",
    "LeftFlange",
    "LipNotch",
    "RightFlange",
    "ScrewHoles",
    "Swage",
    "Web",
];
