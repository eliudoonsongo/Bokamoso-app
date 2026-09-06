"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { Activity } from "lucide-react";
import styles from "./atlas.module.css";

const AtlasExplorer = dynamic(() => import("./atlas-explorer"), {
  ssr: false,
  loading: () => <main className={styles.opening}><Activity size={28} /><h1>Human Atlas</h1><p role="status">Opening the anatomy catalog...</p><Link href="/" prefetch={false}>Your notebooks</Link></main>,
});

export default function AtlasClient() {
  return <AtlasExplorer />;
}