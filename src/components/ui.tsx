"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { X, type LucideIcon } from "lucide-react";
import { useEffect, type ButtonHTMLAttributes, type ReactNode } from "react";

export function IconButton({ icon: Icon, label, className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { icon: LucideIcon; label: string }) {
  return <button type="button" className={`icon-button ${className}`} aria-label={label} title={label} {...props}><Icon size={18} strokeWidth={1.7} /></button>;
}

export function Modal({ title, subtitle, children, onClose, wide = false }: { title: string; subtitle?: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const style = document.documentElement.style;
    let previousHeight = -1;
    let previousTop = -1;
    function update() {
      if (!viewport || (previousHeight === viewport.height && previousTop === viewport.offsetTop)) return;
      previousHeight = viewport.height;
      previousTop = viewport.offsetTop;
      style.setProperty("--visual-height", `${previousHeight}px`);
      style.setProperty("--visual-top", `${previousTop}px`);
    }
    update();
    viewport.addEventListener("resize", update);
    viewport.addEventListener("scroll", update);
    return () => {
      viewport.removeEventListener("resize", update);
      viewport.removeEventListener("scroll", update);
      style.removeProperty("--visual-height");
      style.removeProperty("--visual-top");
    };
  }, []);

  return <Dialog.Root open onOpenChange={(open) => { if (!open) onClose(); }}>
    <Dialog.Portal>
      <Dialog.Overlay className="dialog-overlay" />
      <Dialog.Content className={`dialog-content ${wide ? "dialog-wide" : ""}`} aria-describedby={subtitle ? "dialog-description" : undefined}>
        <div className="dialog-heading">
          <div><Dialog.Title>{title}</Dialog.Title>{subtitle && <Dialog.Description id="dialog-description">{subtitle}</Dialog.Description>}</div>
          <Dialog.Close asChild><IconButton icon={X} label="Close dialog" /></Dialog.Close>
        </div>
        <div className="dialog-body">{children}</div>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}