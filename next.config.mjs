import { PHASE_DEVELOPMENT_SERVER } from "next/constants.js";

export default function config(phase) {
  return {
    distDir: phase === PHASE_DEVELOPMENT_SERVER ? (process.env.FARSIGHT_DEV_DIST_DIR || ".next-dev") : ".next",
  };
}
