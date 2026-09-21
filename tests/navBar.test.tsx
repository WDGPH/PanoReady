import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import NavBar from "../components/NavBar";

describe("NavBar", () => {
  it("exposes the PanoReady brand as a home action", () => {
    const html = renderToStaticMarkup(<NavBar onHome={() => {}} />);

    expect(html).toContain('aria-label="Return to PanoReady home"');
    expect(html).toContain('class="brand brand-home"');
    expect(html).toContain("PanoReady");
  });
});
