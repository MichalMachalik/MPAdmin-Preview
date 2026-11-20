# MPAdmin Preview

[Web MPAdmin](https://michalmachalik.github.io/MPAdmin-Preview/) · [Vyúčtování a pokladna pro Windows](https://michalmachalik.github.io/MPAdmin-Preview/#windows)

Dvě propojená rozhraní pro denní vyúčtování provozovny. Web slouží ke správě a kontrole záznamů, pokladní aplikace k jejich pořízení i během výpadku připojení. Repozitář obsahuje zdrojový kód prohlížečového náhledu. Provozovny, účty, stroje i částky jsou fiktivní.

## Průchod jedním vyúčtováním

1. Otevřete náhled Windows, klikněte na **Spustit** a v dolní liště zvolte **Pracovat offline**.
2. Přidejte denní vyúčtování, změňte žluté pole **Konec** a uložte záznam do pokladní knihy.
3. Obnovte připojení a zvolte **Odeslat data na Server**. Na webu otevřete stejnou provozovnu a datum. Částky můžete porovnat s pokladními zápisy.

Přenos se simuluje ve stejném prohlížeči. Přepnutí mezi webem a Windows zachová rozpracované okno. Při zavření změněného formuláře nabízí aplikace uložení. Klávesa Escape v potvrzovacím dialogu vrátí uživatele k rozepsané práci.

## Co lze ověřit

| Oblast | Chování |
| --- | --- |
| Vyúčtování a pokladna | Denní a měsíční přehledy, vícedenní příjmy a výdaje, výčetka hotovosti, trezory a historie zůstatků. Oprava čekajícího vyúčtování aktualizuje související zápisy. |
| Evidence a správa | Detail automatu, vlastní pořadí, hromadný import, vložení tabulky z Excelu, skupiny uživatelů, přiřazení provozoven a číselníky. |
| Souběžná práce | Více otevřených formulářů, minimalizace a návrat do okna. Pokud jiná karta mezitím změní záznam, aplikace zachová rozepsané hodnoty a upozorní na konflikt. |
| Výstupy | Exporty XLS, PDF a CSV, tisk přes prohlížeč a místní historie ukázkových SMS a e-mailů. |

## Spuštění ze zdrojů

Pro statický web stačí Python 3. Z kořene repozitáře spusťte server a otevřete [web](http://127.0.0.1:8000/) nebo [pokladní aplikaci](http://127.0.0.1:8000/#windows).

```sh
python -m http.server 8000 --bind 127.0.0.1 --directory docs
```

V druhém terminálu spusťte `npm test`. Testy v [tests/](tests/) ověřují výpočty, zápisy a místní odesílání. Veškeré soubory potřebné pro běh náhledu jsou v [docs/](docs/). Tlačítko **Obnovit demo** obnoví v prohlížeči výchozí data, včetně provozoven se 6 a 500 automaty.

Webové rozhraní i pokladní klient verze 2.0.4 jsou zde zpracované v HTML, CSS a JavaScriptu. Data zůstávají v prohlížeči. Exporty používají přibalené knihovny SheetJS, pdf-lib a fontkit a písmo DejaVu Sans. [Licence použitých knihoven a písma](docs/vendor/)
