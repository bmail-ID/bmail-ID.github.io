"""Rebuild frontend/index.html and frontend/styles.css from the original prototype.

    python tools/build_frontend.py ["<path to the prototype .html>"]

* index.html  = frontend/layout.template.html, with every "{{KEEP a-b}}" line replaced
                by lines a..b of the prototype, byte for byte (static explanatory views).
* styles.css  = the prototype's two <style> blocks, verbatim, + frontend/additions.css.

The prototype's SHA-256 is checked against prototype_extract/SOURCE_SHA256.txt so a
changed prototype is noticed rather than silently spliced.
"""
import hashlib
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_SRC = os.path.join(ROOT, "prototype", "bmail_id_research_prototype.html")
STYLE_RANGES = [(9, 260), (1595, 1631)]   # the two <style> blocks of the prototype


def main(src):
    raw = open(src, "rb").read()
    digest = hashlib.sha256(raw).hexdigest()
    expected = open(os.path.join(ROOT, "prototype_extract", "SOURCE_SHA256.txt"), encoding="utf-8").read().split()[0]
    if digest != expected:
        sys.exit("prototype changed (sha256 %s, expected %s) - re-check the KEEP line ranges" % (digest, expected))
    lines = raw.decode("utf-8").splitlines(keepends=True)

    def keep(a, b):
        return "".join(lines[a - 1:b])

    tpl = open(os.path.join(ROOT, "frontend", "layout.template.html"), encoding="utf-8").read()
    out, n = re.subn(r"^\{\{KEEP (\d+)-(\d+)\}\}\n", lambda m: keep(int(m.group(1)), int(m.group(2))), tpl, flags=re.M)
    with open(os.path.join(ROOT, "frontend", "index.html"), "w", encoding="utf-8", newline="") as fh:
        fh.write(out)
    css = "/* === verbatim from the prototype === */\n" + "".join(keep(a, b) for a, b in STYLE_RANGES)
    css += "\n/* === additions for the source build === */\n"
    css += open(os.path.join(ROOT, "frontend", "additions.css"), encoding="utf-8").read()
    with open(os.path.join(ROOT, "frontend", "styles.css"), "w", encoding="utf-8", newline="") as fh:
        fh.write(css)
    print("index.html: %d verbatim blocks spliced; styles.css written" % n)


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else DEFAULT_SRC)
