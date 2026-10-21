import mongoose from "mongoose";
import { AccessToken } from "livekit-server-sdk";
import { AppError } from "../../shared/errors/AppError.js";
import { Appointment } from "../appointments/appointment_model.js";
import { joinState, roomNameFor, sideFor } from "./telehealth_logic.js";

export const joinTokenService = async ({ appointmentId, authUser, nowMs = Date.now() }) => {
  if (!mongoose.Types.ObjectId.isValid(appointmentId)) throw new AppError("Invalid appointment", 400, "INVALID_ID");
  const { LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET } = process.env;
  if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
    throw new AppError("Video visits are not switched on yet.", 503, "VIDEO_NOT_CONFIGURED");
  }
  const appt = await Appointment.findById(appointmentId).lean();
  if (!appt) throw new AppError("Appointment not found", 404, "NOT_FOUND");

  const side = sideFor(appt, authUser);
  const state = joinState(appt, side, nowMs);
  if (!state.ok) {
    const err = new AppError(state.message, state.status, state.code);
    if (state.opensAt) err.opensAt = state.opensAt;
    throw err;
  }

  const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
    identity: `${side}:${authUser.sub}`,
    name: authUser.fullName || (side === "provider" ? "Provider" : "Patient"),
    ttl: 60 * 60,
  });
  at.addGrant({ room: roomNameFor(appointmentId), roomJoin: true, canPublish: true, canSubscribe: true, canPublishData: true });
  return { url: LIVEKIT_URL, token: await at.toJwt(), room: roomNameFor(appointmentId), side, closesAt: state.window.closesAt };
};
