## Co?

STAG Updater je node.js aplikace určená k aktualizování databáze obrázků vozů do hry Staničář.
Obrázky stahuje stejně jako původní Stag, ale z mé zkušenosti rychleji a hlavně spolehlivě.

## Proč?

Už dlouho se potýkám s problémy při stahování aktuálních definic vozů přes Stag. Vždy dojde k zahájení stahování a zhruba v půlce se najednou přeruší a celou databázi nestáhnu.
Rozhodl jsem se proto skrze zapojení mé hlavy a ChatGPT splácat tento program, který se snaží tento problém vyřešit.

## Jak to používat?

Nejprve je nutné aplikaci spustit, to lze hned několika způsoby:
1) Stáhnutí a spuštění již sestavené aplikace [tady](https://github.com/tpeterka1/stag_updater/releases/latest) - aplikace sestavené přes node.js package [exe](https://www.npmjs.com/package/@angablue/exe) (jsou velké, musí mít přibalený node.js runtime)
2) Stáhnutí node.js frameworku a spuštění v něm - nainstalujte dependencies příkazem "npm i", spusťte aplikaci příkazem "node index.js"
3) Sestavení vlastního exe - postupujte podle 2., ale místo příkazu ke spuštění sestavte aplikaci příkazem "npm run build"
<br>
Po spuštění vás program vyzve k nastavení složky se Stagem, abychom nestahovali obrázky někam úplně jinam, složku uloží do nastavení, takže ji neni potřeba nastavovat vícekrát.
Dále postupujte podle jednoduchých instrukcí programu, měli byste skončit s kompletní databází.
