export const generateUsername = (email) => {
  const emailPrefix = email?.split("@")[0];

  const cleanedPrefix = emailPrefix
    ?.toLowerCase()
    ?.replace(/[^a-z0-9]/g, "");

  const randomNumber = Math.floor(10000 + Math.random() * 90000);

  return `${cleanedPrefix}_${randomNumber}`;
};