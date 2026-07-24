import axios from "axios";
import dotenv from "dotenv";
dotenv.config();

const GOOGLE_MAPS_SERVER_API_KEY = process.env.GOOGLE_MAPS_SERVER_API_KEY?.trim();

export const geocodeAddress = async (address) => {
  if (!GOOGLE_MAPS_SERVER_API_KEY) {
    console.warn("GOOGLE_MAPS_SERVER_API_KEY not configured — skipping geocode");
    return null;
  }

  if (!address || !address.trim()) {
    return null;
  }

  try {
    const { data } = await axios.get(
      "https://maps.googleapis.com/maps/api/geocode/json",
      {
        params: {
          address: address.trim(),
          region: "ng",
          key: GOOGLE_MAPS_SERVER_API_KEY,
        },
        timeout: 8000,
      },
    );

    if (data.status !== "OK" || !data.results?.length) {
      console.warn("Geocoding returned no result:", {
        address,
        status: data.status,
      });
      return null;
    }

    const { lat, lng } = data.results[0].geometry.location;

    return {
      type: "Point",
      coordinates: [lng, lat],
    };
  } catch (error) {
    console.error(
      "Geocoding error:",
      error.response?.data || error.message,
    );
    return null;
  }
};
