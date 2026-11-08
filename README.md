# AU Acknowledgement Blocker

Though the majority of Australians do not support the increasingly pervasive acknowledgement of country ritual, it has become a religious obsession of our occupational bureaucrat class and is infecting every website and public event we use day-to-day with only more and more invasive and confrontational vigour. After experiencing a website which actually forces the user to confirm that they _agree_ with the acknowledgement before they may use the site, I decided I had had enough. I have made this plugin, which deletes the acknowledgement of country popup & footer banners from as many popularly-used websites as occurred to me. No more digital struggle sessions as a prerequisite to find out when your local museum is open! I have very simply gone to each website, found some code-friendly identifier of the acknowledgement div, and added it to a div blacklist for that url.

The extension also optionally replaces commonly used local aboriginal greetings with 'Welcome' on Australian (`.au`) websites and a list of other Australian sites in `manifest.json`. You can turn this behaviour off by clicking the extension's icon in the toolbar if you prefer to just use the acknowledgement blocker.

_Australia was born in the year 449 AD when Hengist & Horsa made first land at Ebbsfleet. She is a British colony and country, made from bare earth by the descendants of those brothers. The repository authors do NOT acknowledge or recognise any owner of this land that does not descend from their great stock._

<p align="center">
  <a href="https://commons.wikimedia.org/wiki/File%3ALanding_of_Lieutenant_James_Cook_at_Botany_Bay%2C_29_April_1770_%28painting_by_E_Phillips_Fox%29.jpg"><img src="https://upload.wikimedia.org/wikipedia/commons/thumb/6/6b/Landing_of_Lieutenant_James_Cook_at_Botany_Bay%2C_29_April_1770_%28painting_by_E_Phillips_Fox%29.jpg/960px-Landing_of_Lieutenant_James_Cook_at_Botany_Bay%2C_29_April_1770_%28painting_by_E_Phillips_Fox%29.jpg" alt="Landing of Lieutenant James Cook at Botany Bay, 29 April 1770, by E. Phillips Fox" width="720"></a>
</p>

## How to use

### Chrome-based

I haven't put it on the chrome store because it costs $5 and there is a risk of getting banned & doxxed.
I may reconsider, but installation is still pretty simple:

1. Download the `.zip` from the [latest release](../../releases/latest) and unzip it somewhere permanent (the browser loads it from there).
2. Open `chrome://extensions`.
3. Turn on developer mode.
4. Choose **load unpacked** and select the unzipped folder.

To update, unzip the new release over the same folder, open `chrome://extensions` again and press the reload button on the extension card.

### Firefox

1. Clone or download the repo.
2. Open `about:debugging#/runtime/this-firefox.`
3. Choose **Load Temporary Add-on** and select `manifest.json` in the repo folder.
4. After editing a file, press **Reload** on the extension's card.

Standard firefox will remove developer extensions on restart, until we have a proper .xpi file you'll need to reload it each time, or use firefox nightly for permanent installation.
