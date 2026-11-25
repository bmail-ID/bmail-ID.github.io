# Posting this prototype on GitHub — checklist for the maintainer

This folder is ready to become a repository as it is. Delete this file after posting, or keep it
as a maintainer note.

## Reviewer access (the paper's reviewers must reach the prototype AND its code)

Pick the route that matches the journal's review model:

| Review model | How to give reviewers access |
|---|---|
| **Single-blind / open** | A **public** repository. Put its URL (and the release tag, e.g. `v1.0-paper`) in the paper's code-availability statement. |
| **Double-blind** | Reviewers must not learn the authors from the repository. Either (a) upload an anonymised copy to an anonymous mirror such as anonymous.4open.science (it mirrors a GitHub repo with names stripped), or (b) attach the zip as supplementary material. Before either: replace the author's name in the demo data (item 3 below), the local paths in the original prototype (item 4), and use a neutral commit author. |
| **Private until acceptance** | Private repository; invite the reviewers' GitHub accounts via the editor, or give the editor the zip. Make it public on acceptance. |

**Let reviewers see it without installing anything.** The original prototype is a single static
page, so GitHub Pages can host it: Settings → Pages → deploy from branch `main`, folder `/ (root)`;
the page is then at `https://<account>.github.io/<repository>/prototype/bmail_id_research_prototype.html`.
The working system (server + protocols) needs Python 3.8+ only; the README's quick start and the
walk-through (section 2) are what a reviewer follows. GitHub Pages cannot run the Python server;
an online live demo would need a hosting service and is not set up.

## Decide before posting (the authors' call)

1. **License.** No LICENSE file is included. Without one, others may read the code but not legally
   reuse it. Common choices for research prototypes: MIT or Apache-2.0 (permissive). Add the file with
   GitHub's "Add file → Create new file → LICENSE" picker.
2. **Public or private.** Many journals accept a private repository shared with reviewers, then made
   public on acceptance. Check the journal's code-availability policy.
3. **This copy is ANONYMISED for double-blind review.** The author's name in the demo (now the
   fictitious "Prof. Alex Morgan", `alex.morgan@bgmail.com`), the author citations on the screens
   (now "Anonymous (2025)"), and the local file paths in the prototype header were replaced, in the
   prototype HTML too; `prototype_extract/SOURCE_SHA256.txt` holds the anonymised file's hash. The
   commit author is neutral. The term "bMail" and the phrase "Bright Internet Initiative" (sidebar
   footer) are kept, as they name the research subject. After acceptance, restore the real names with
   a new commit (or post the non-anonymised version) for the public release.
4. **Before uploading, re-check** with a search for the authors' names and institution across all
   files; also make sure the GitHub account used is not personally identifying (or use an anonymous
   mirror).
5. **Citation.** Optionally add a `CITATION.cff` with the paper's authors and title so GitHub shows
   a "Cite this repository" button, and archive a release on Zenodo for a DOI.

## Posting

```
git init
git add .
git commit -m "bMail ID infrastructure prototype: source build of the research prototype"
git branch -M main
git remote add origin https://github.com/<account>/<repository>.git
git push -u origin main
```

Then on GitHub: add a short description and topics (e.g. `digital-identity`, `email`,
`design-science`), and tag a release (e.g. `v1.0-paper`) matching the version cited in the paper,
so reviewers see exactly that code.

## Verify after posting

Clone into a fresh folder and run:
```
python run_tests.py      # expect: Ran 21 tests ... OK
python run_server.py     # open http://127.0.0.1:8765/
```

## Working on it

* Edit `frontend/layout.template.html` / `frontend/additions.css`, never the generated
  `frontend/index.html` / `frontend/styles.css`; rebuild with `python tools/build_frontend.py`.
* README section 4 maps every prototype feature to its source file or marks it "not implemented".
* The pure-Python Ed25519 is correct (RFC 8032 vectors) but not constant-time: research use only.
