# Imane Ferradj — Personal Website

This version replaces the missing portrait hero with figures extracted from the thesis manuscript.

## Main changes

- Uses thesis figures to illustrate the website
- Rewrites the homepage text to follow the thesis logic more closely
- Keeps the Apple-inspired calm blue visual language
- Preserves the three-page structure:
  - `index.html`
  - `resume.html`
  - `publications.html`

## Upload / replace on GitHub

Replace the files at the root of your `ImaneFerradj.github.io` repository with:

- `index.html`
- `resume.html`
- `publications.html`
- `README.md`

Then replace the entire `assets` folder with the new one from this package.

## Included figures

All figures are illustrations taken from the thesis manuscript (no results or experimental data):

- clinical concept of the telecystoscopy procedure
- strain-to-bending principle
- multilayer actuator
- three-section electrode layout
- wall inspection by the robot tip
- inspection pipeline (scanning to lesion detection)
- robot cross-section
- straight and helical actuator routing

## Languages

The site can be read in English, French, Arabic and Japanese using the menu in the top bar.
All translations are in `assets/i18n.js`. Each translated element in the HTML has a
`data-i18n="tXXX"` key; to change a sentence, edit the matching key in each language.
Arabic switches the layout to right-to-left automatically. A link can open a given language
directly by adding `?lang=fr`, `?lang=ar` or `?lang=ja` to the address.
Paper titles, author lists and venues stay in English.
