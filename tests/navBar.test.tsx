import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import NavBar from "../components/NavBar";

describe("NavBar", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("exposes the PanoReady brand as a home action", () => {
    const html = renderToStaticMarkup(<NavBar onHome={() => {}} />);

    expect(html).toContain('aria-label="Return to PanoReady home"');
    expect(html).toContain('class="brand brand-home"');
    expect(html).toContain("PanoReady");
  });

  it("links to the custom-domain manual by default", () => {
    vi.stubEnv("NEXT_PUBLIC_DOCS_URL", "");
    const html = renderToStaticMarkup(<NavBar onHome={() => {}} />);

    expect(html).toContain('href="https://docs.phiz.ca/panoready/stable/"');
  });

  it("uses the matching manual supplied by the application build", () => {
    vi.stubEnv("NEXT_PUBLIC_DOCS_URL", "https://docs.phiz.ca/panoready/v0.4.1/");
    const html = renderToStaticMarkup(<NavBar onHome={() => {}} />);

    expect(html).toContain('href="https://docs.phiz.ca/panoready/v0.4.1/"');
  });
});
