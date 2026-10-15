# License and attribution

This page explains the license chosen for google-services-mcps, what it requires, and why. It is not legal advice.

## Short answer

google-services-mcps is licensed under the **Apache License, Version 2.0** (SPDX `Apache-2.0`). Attribution is carried by the [NOTICE](../NOTICE) file, which must travel with every distributed copy and derivative work.

No open-source license can make people mention the author in every use, edit, post, package, delivery or share. Private use needs no credit under any of the licenses compared here. The license can require credit only where a copy or a changed version is distributed. Posts and promotion are not covered by a legal duty, so the README gives copy-paste credit text instead.

## What was checked

- **Apache License 2.0**: official text at https://www.apache.org/licenses/LICENSE-2.0.txt. The [LICENSE](../LICENSE) file is a byte-identical copy of that text. OSI page https://opensource.org/license/apache-2-0 shows the "Open Source Initiative Approved License" badge and SPDX `Apache-2.0`.
- **MIT**: OSI page https://opensource.org/license/mit shows the OSI approval badge and SPDX `MIT`.
- **Attribution Assurance License (AAL)**: OSI page https://opensource.org/license/AAL. The page shows the OSI approval badge, the category "Redundant with more popular" and SPDX `AAL`. SPDX entry: https://spdx.org/licenses/AAL.html. The legal text is in clauses 1 to 4 of the page.
- **Creative Commons Attribution 4.0 (CC BY 4.0)**: legal code at https://creativecommons.org/licenses/by/4.0/legalcode. Creative Commons' advice on software: https://creativecommons.org/faq/#can-i-apply-a-creative-commons-license-to-software, which says "We recommend against using Creative Commons licenses for software." I did not verify CC BY 4.0 as OSI-approved. It is not on page 1 of 11 of the OSI license list (https://opensource.org/licenses), and I did not check the other pages.
- **GitHub's license picker**: https://choosealicense.com/licenses/ lists Apache 2.0, MIT, GPL, LGPL, AGPL, MPL 2.0, BSL 1.0 and Unlicense. It does not list AAL or CC BY 4.0.

## Comparison

| Question | Apache-2.0 (chosen) | MIT | AAL | CC BY 4.0 |
|---|---|---|---|---|
| (a) Private use | No duty. | No duty. | No duty. Duties apply on redistribution only. | No duty. Duties apply when shared. |
| (b) Editing and derived works | Only when a changed version is distributed: changed files must say they were changed (s.4(b)) and keep the existing attribution notices (s.4(c)). Private edits carry no duty. | The copyright and permission notice must stay in all copies or substantial portions that are distributed. | Covered by redistribution: modified source that is redistributed must display the GPG-signed text (cl. 1). | Sharing adapted material requires attribution and an indication of modifications (s.3(a)(1)). |
| (c) Redistribution and packaging | Give recipients the license (s.4(a)), keep attribution notices (s.4(c)), and include the NOTICE contents in distributed derivative works (s.4(d)). | Keep the copyright and permission notice. | Source: display the GPG-signed text prominently (cl. 1). Binary: the text in the documentation, plus a prominent display at each launch of the executable or a dependent program (cl. 2). | Attribution elements in s.3(a)(1). |
| (d) Public posts and promotion | No duty. Section 6 does not allow promotional use of the licensor's names beyond "reasonable and customary use in describing the origin of the Work". | No duty. | No duty in posts. Clause 3 forbids using the author's name or trademark to endorse or promote derived products without prior written permission. | Sharing the material publicly needs attribution. Posts that only discuss it do not. |
| (e) OSI status | Approved (SPDX `Apache-2.0`). | Approved (SPDX `MIT`). | Approved badge, but the page lists it as "Redundant with more popular" (SPDX `AAL`). | Not verified. Creative Commons recommends against it for software. |
| (f) What attribution must include | The NOTICE contents, plus the license text. | The copyright line and the permission notice. | Author name, professional identification and URL, plus the GPG-signed text. | Creator identification, copyright notice, license notice, warranty disclaimer, a URI or link, and an indication of changes. |

## Why Apache-2.0 with a NOTICE file

AAL is the only candidate whose text asks for on-screen credit at every launch, which is closest to the owner's wish. It cannot be used as published here, for four reasons. Clauses 1 and 2 require "this GPG-signed text" to be displayed, which needs the owner's own GPG signature, and that signature cannot be made here. Clause 2 also requires a "professional identification" that the owner has not provided. GitHub's license picker does not list AAL, so the repository would not show a recognised license. OSI lists AAL as "Redundant with more popular". MIT gives credit only through a copyright line and has no notice file. CC BY 4.0 is written for creative works, and Creative Commons itself advises against using it for software. Apache-2.0 is OSI-approved, is listed by GitHub and by package registries under the SPDX id `Apache-2.0`, and its section 4(d) makes the NOTICE contents a binding duty for every distributed derivative work. The NOTICE can name the author, the repository, the profile and the link. The trade-off is that Apache-2.0 places no duty on private use or on posts. If the owner later signs the text with their own GPG key and supplies a professional identification, AAL could be reconsidered. That would be a new decision.

## What the NOTICE requires in practice

- **Private use**: nothing.
- **Editing privately**: nothing, as long as you do not distribute the result.
- **Packaging or sharing a copy**: keep the LICENSE file and the attribution notices (s.4(a) and s.4(c)).
- **Distributing a modified version**: mark the changed files and include the NOTICE contents (s.4(b) and s.4(d)).
- **Posts and documentation**: no legal duty. The README gives the attribution sentence to copy.

## Files

- [LICENSE](../LICENSE): the Apache License, Version 2.0, copied from the official text.
- [NOTICE](../NOTICE): the attribution notice to keep with every copy.
- [CONTRIBUTING.md](../CONTRIBUTING.md): contributions are under the same license.
- [README.md](../README.md): the License and Acknowledgements sections, and the `license` field in `package.json`.
