import "@testing-library/jest-dom/vitest";

// jsdom has no canvas backend (it logs "Not implemented" on getContext); decorative canvases
// skip drawing when there is no context. Tests that need one spy on getContext.
HTMLCanvasElement.prototype.getContext = (() => null) as unknown as HTMLCanvasElement["getContext"];
