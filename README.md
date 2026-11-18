# MPAdmin Preview

Interaktivní ukázka webu MPAdmin a aplikace Vyúčtování a pokladna.

[Web MPAdmin](https://michalmachalik.github.io/MPAdmin-Preview/) · [Windows aplikace](https://michalmachalik.github.io/MPAdmin-Preview/#windows)

Na webu otevřete provozovnu a klikněte na **Přidej denní vyúčtování**. Změňte žluté pole **Konec** a sledujte součet podle typu zařízení. Datum ve výpisu otevírá podrobný přehled; tlačítkem **Upravit** otevřete formulář.

Ukázka obsahuje:

- evidenci automatů, samostatné pořadí a číslo, detail zařízení, jednotlivá vyúčtování, hromadný import a vložení tabulky z Excelu;
- denní a měsíční vyúčtování, vícedenní příjmy a výdaje a přehledy jednotlivých automatů;
- pokladní, manažerskou a bezhotovostní manažerskou knihu, účetní knihy uživatelů a přiřazování provozoven;
- správu uživatelů, jejich skupin, platnosti přiřazení k provozovnám, hesel a pokladníků;
- správu provozoven, číselníků, položek příjmů a výdajů a instancí aplikace;
- výčetku bankovek a mincí s vložením částky do vyúčtování, trezory, kalkulačku a historii provozní hotovosti;
- ukázkové SMS a e-maily se skupinami příjemců a místní historií zpráv;
- exporty do XLS a PDF s českými znaky, doplňkové CSV exporty a tisk přes prohlížeč;
- původní členění filtrů, samostatné směry řazení, stránkování a kalendáře s českými názvy;
- více současně rozpracovaných vyúčtování, nabídku oken, minimalizaci, přesouvání, změnu velikosti formulářů a nabídku uložení při zavření aplikace.

Ve Windows ukázce klikněte ve spouštěči na **Spustit**, v dolní liště zvolte **Pracovat offline** a uložte vyúčtování. Poté obnovte připojení a zvolte **Odeslat data na Server**. Záznam se objeví také na webu.

Při přepnutí z Windows ukázky na web zůstane rozpracované vyúčtování otevřené v ukázkové relaci. Po návratu do Windows ukázky se znovu zobrazí se zadanými hodnotami.

Při zavření upraveného vyúčtování nebo záznamu pokladní knihy nabídne Windows ukázka uložení. Klávesa Escape v potvrzovacím dialogu vrátí uživatele do rozpracovaného formuláře.

Obě rozhraní běží v prohlížeči. Připojení, přenos záznamů a aktualizace spouštěče se simulují lokálně. SMS a e-maily se ukládají jen do místní historie a nikomu se neodesílají. Výchozí provozovny, účty, stroje i částky jsou smyšlené. Tlačítko **Obnovit demo** vrátí výchozí data v prohlížeči.

Vzhled vychází z webu MPAdmin a klienta Vyúčtování a pokladna 2.0.4. Ukázka reprodukuje jejich obrazovky a pracovní postupy v HTML, CSS a JavaScriptu. Přihlášení a oprávnění jsou součástí místní demonstrace; úložiště patří konkrétnímu prohlížeči. Instalaci Windows, tiskový dialog a přenos na skutečný server nahrazuje prostředí prohlížeče. Přihlášený je výchozí smyšlený správce; po odhlášení jsou přístupové údaje uvedené na přihlašovací obrazovce.

Výchozí soubor obsahuje provozovny se 6 a 500 automaty. Úpravy se uchovávají po obnovení stránky. Změny v otevřené starší kartě vyvolají kontrolu konfliktu; rozpracovaný formulář zůstane dostupný. Hromadný import a odeslání čekajících záznamů se zapisují jako jeden celek.

Uložení vyúčtování vytvoří odpovídající pokladní záznamy pro typy automatů a jednotlivé denní příjmy a výdaje. Změna dosud neodeslaného vyúčtování nahradí související zápisy včetně odstranění již nepoužitých položek. Aplikace uzamyká potvrzená vyúčtování a umožňuje upravit poslední čekající záznam. Zůstatky respektují pořadí zápisů včetně zpětně datovaných položek; trezory sčítají vklady a výběry.

## Místní spuštění

```sh
python -m http.server 8000 --bind 127.0.0.1 --directory docs
```

Web otevřete na `http://127.0.0.1:8000/` a aplikaci na `http://127.0.0.1:8000/#windows`. Kontroly výpočtů, úprav záznamů a místního odesílání spustíte pomocí `npm test`.

XLS export používá přibalený SheetJS 0.20.3. PDF export používá pdf-lib 1.17.1, @pdf-lib/fontkit 1.1.1 a písmo DejaVu Sans. Licenční texty jsou přiložené v `docs/vendor/`. Aplikace načítá své soubory ze stejného webu a neodesílá zadané údaje na server.
