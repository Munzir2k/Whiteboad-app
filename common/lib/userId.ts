import { v4 } from "uuid";

const STORAGE_KEY = "whiteboard_user_id";

export const getUserId = () => {
  if (typeof window === "undefined") return "";

  let id = sessionStorage.getItem(STORAGE_KEY);

  if (!id) {
    id = v4();
    sessionStorage.setItem(STORAGE_KEY, id);
  }

  return id;
};
