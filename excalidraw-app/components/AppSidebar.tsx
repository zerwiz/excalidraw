import { DefaultSidebar } from "@excalidraw/excalidraw";

/**
 * The app sidebar. Excalidraw's promotional tabs (comments, presentation) were
 * removed with the upsell surfaces; what remains are the built-in library and
 * canvas-search tabs, which DefaultSidebar renders itself.
 */
export const AppSidebar = () => {
  return <DefaultSidebar />;
};
