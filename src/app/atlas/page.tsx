import type { Metadata } from "next";
import AtlasClient from "@/components/atlas/atlas-client";

export const metadata: Metadata = {
  title: "Human Atlas | Bokamoso",
  description: "Explore the human body's anatomy and connect structures to your Life Sciences notebook.",
};

export default function AtlasPage() {
  return <AtlasClient />;
}