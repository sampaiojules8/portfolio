# portfolio
My portfolio. https://www.julianasampaio.com/

## Password-locked case studies

Part of `monyo-design-system.html`, `monyo-onboarding.html` and `credit-genie-debit-cards.html`
is locked behind a password. The locked HTML and the images and videos only it uses are
encrypted (the `.enc` files), so the published site holds no readable copy; `vault.js`
decrypts them in the browser when a visitor enters the password.

To edit a locked page, unlock it, make the change, then lock it again
(the password is not stored in this repository):

    VAULT_PASSWORD='the password' node tools/vault.mjs unlock monyo-onboarding.html
    # edit the page; the locked part sits between <!-- vault:start --> and <!-- vault:end -->
    VAULT_PASSWORD='the password' node tools/vault.mjs lock monyo-onboarding.html

To lock another page, wrap the part to hide in those two markers, add
`<script src="vault.js"></script>` after `script.js`, and run `lock` on it.

## Hidden pages

`gamified-creatives.html` is hidden: no page links to it and search engines are asked
not to list it. To show it again, restore its card in `index.html` and point the
"next project" link in `ai-creatives.html` back to it.
