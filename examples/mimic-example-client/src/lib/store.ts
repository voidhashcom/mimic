import { create } from "zustand";
import { mimic } from "@voidhash/mimic-react/zustand";
import { createDocument } from "./document";

export const useTodoStore = create(mimic(createDocument("1", { name: "John Doe" }), () => ({
    
})));