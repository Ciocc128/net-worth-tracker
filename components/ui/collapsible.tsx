import { Collapsible as CollapsiblePrimitive } from "radix-ui"

const Collapsible = CollapsiblePrimitive.Root

const CollapsibleTrigger = CollapsiblePrimitive.CollapsibleTrigger

const CollapsibleContent = CollapsiblePrimitive.CollapsibleContent

/**
 * «Dettaglio» opens and closes smoothly (AN1, doc/animazioni/README.md § 5.3, 300 ms on `ease-spring`;
 * globals.css → Disclosure): the content of the ten Dettaglio disclosures takes this class. The shared
 * primitive does not carry it — other Collapsibles stay as they are.
 */
const DISCLOSURE_MOTION_CLASS = "disclosure-motion"

export { DISCLOSURE_MOTION_CLASS, Collapsible, CollapsibleTrigger, CollapsibleContent }
