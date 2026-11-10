# Logomocja w przeglądarce

Wierna, przeglądarkowa implementacja **Logomocji**, czyli polskiej edycji **Imagine Logo**.
Pisze się w niej po polsku (`naprzód 100`, `powtórz 4 [np 50 pw 90]`, `oto … już`). Działają też
angielskie nazwy z Imagine (`forward`, `repeat`, `to … end`), więc programy z angielskiego Imagine
też się uruchamiają.

Całość to czysty JavaScript (moduły ES) bez żadnych zależności i bez kroku budowania. Wystarczy
zwykły serwer plików statycznych.

## Uruchomienie

```sh
cd komeniusz-imagine
python3 -m http.server 8080      # albo: npm start
```

Potem otwórz w przeglądarce <http://localhost:8080/>.

Strony nie da się otworzyć bezpośrednio z dysku (`file://…`), bo przeglądarki nie wczytują wtedy
modułów ES. Potrzebny jest serwer, choćby ten z Pythona.

W oknie programu znajdziesz:
- **pole tekstowe** (wyniki `pisz`, komunikaty błędów) i **linię poleceń** (strzałki ↑/↓ przeglądają historię);
- **stronę** z żółwiem;
- **edytor procedur**;
- **pomoc** z wyszukiwarką wszystkich procedur pierwotnych;
- **suwak prędkości** żółwia;
- listę **Przykłady…**;
- menu **Plik**: zapis i odczyt projektów `.lgm`, import plików `.imp` z Logomocji 2.0 oraz eksport strony do PNG.

Przycisk **Zatrzymaj**, klawisze **Esc** i **F12** oraz polecenie `zatrzymajWszystko` przerywają wszystkie
procesy, tak jak F12 w oryginale.

## Testy

```sh
npm test          # node --test "tests/**/*.test.js"
```

Potrzebny jest Node.js 22 lub nowszy (wzorzec plików w `node --test`). Testy działają bez przeglądarki, na „bezgłowej” powierzchni
rysowania (`HeadlessSurface`), która naprawdę rysuje piksele w pamięci. Dlatego można w nich
sprawdzać na przykład kolor zamalowanego obszaru.

`tests/examples.test.js` uruchamia **każdy** przykład z katalogu `examples/` tak samo jak interfejs:
- wczytuje plik i uruchamia procedurę `starter`;
- w przykładach interaktywnych symuluje zdarzenia: klawisze, kliknięcia, suwak i przyciski;
- przykłady z procesami działającymi bez końca zatrzymuje po chwili.

Test nie przechodzi, jeśli przykład wypisze jakikolwiek błąd.

## Przykłady

Katalog `examples/` zawiera 17 programów. Ich spis jest w `examples/index.json`, a w interfejsie
wybiera się je z listy „Przykłady…”.

| plik | co pokazuje |
|---|---|
| `01_kwadrat_wielokaty.lgm` | procedury z parametrami, `powtórz`, `dla`, `zamaluj` |
| `02_spirale.lgm` | spirala rekurencyjna i tęczowa spirala |
| `03_drzewo.lgm` | drzewo fraktalne (rekurencja) |
| `04_platek_kocha.lgm` | płatek Kocha zamalowany od środka |
| `05_gwiazdy.lgm` | gwiazdy w losowych kolorach (`jld`, `losowa`), `wielokąt` |
| `06_rozeta.lgm` | rozety z łuków i z okręgów |
| `07_zegar.lgm` | zegar animowany w procesie równoległym (`co 1000 [...]`) |
| `08_wyscig_zolwi.lgm` | kilka żółwi: `ż2'np 10`, `proszę`, `słuchaj`, `każdy` |
| `09_gra_lapanie.lgm` | gra ze zdarzeniami `gdyKlik` i `gdyKlawisz` |
| `10_suwak_kat.lgm` | suwak (`gdyZmieniasz`) sterujący kątem gwiazdy |
| `11_przyciski.lgm` | przyciski ze zdarzeniem `gdyWciśnięty` |
| `12_slowa_i_listy.lgm` | słowa i listy: odwracanie, palindromy, sortowanie, szyfr Cezara |
| `13_logia_szachownica.lgm` | zadanie w stylu konkursu LOGIA: szachownica i suma cyfr |
| `14_kolorowe_banki.lgm` | losowe koła |
| `15_pilki.lgm` | odbijające się piłki (`odbij`, `bezKońca`) |
| `16_rekurencja_liczby.lgm` | silnia, Fibonacci, wykres słupkowy |
| `17_motyle.lgm` | własna klasa (`nowaKlasa`), zdarzenie usuwające klikniętego motyla |

Projekt `.lgm` to zwykły tekst programu w Logomocji (UTF-8): definicje `oto … już`, opcjonalnie
polecenia i procedura `starter`, która uruchamia się sama po wczytaniu.

## Co działa

- **Język** (`docs/PRIMITYWY.md`, około 350 procedur pierwotnych, ponad 800 nazw razem z aliasami):
  - słowa, liczby i listy, `:zmienna`, `"słowo`, `|słowo ze spacjami|`, komentarze `;`;
  - operatory wrostkowe z priorytetami, także na wektorach (`poz + [10 20]`);
  - procedury `oto … już`, również jednowierszowe: `oto kw :b powtórz 4 [np :b pw 90] już`;
  - parametry opcjonalne w stylu Imagine (`oto p :a :b [1]`);
  - dynamiczny zasięg zmiennych, `niech`, `przypisz`, `lokalna`;
  - rekurencja ogonowa bez limitu, także przez `jeśli`, `jeżeli` i `uruchom`.
- **Sterowanie:**
  - `powtórz`, `dla`, `dopóki`, `dlaKażdego`, `pętla`, `numpow`;
  - `jeśli` z opcjonalną gałęzią „inaczej”, `jeżeli`, `wybierz`, `test`/`jeśliTak`/`jeśliNie`;
  - `złap`/`rzuć`, `wynik`, `stop`, `czekaj`.
- **Grafika żółwia** (strona 796 × 499):
  - pisak, kolory (paleta 0–15, nazwy Imagine z jasnością 1–12, RGB, `jld`);
  - zamalowywanie, okręgi, koła, elipsy, wielokąty i listy rysujące;
  - tekst na stronie, style zakresu `sklej`/`okno`/`płot`/`odbij`;
  - postacie i animacja, stemplowanie, linia tła, wiele stron.
- **Wiele żółwi i obiekty:**
  - `słuchaj`, `kto`, `proszę`, `każdy`, składnia apostrofowa `ż1'np 50`;
  - `nowy`, `nowaKlasa`, `klonuj`, dziedziczenie, zachowania, zmienne własne i wspólne, `zwykle`.
- **Procesy i zdarzenia:**
  - procesy: `bezKońca`, `co`, `równolegle`, `poCzasie`, `anuluj`, `zatrzymajWszystko`, `wstrzymajWszystko`;
  - zdarzenia `gdyKlik`, `gdyKlawisz`, `gdyZderzenie`, `gdyUtworzony`, `gdyCzyść` i inne (razem 20).
- **Elementy interfejsu:** przyciski, suwaki, pola tekstowe i pasek przycisków.
  - Nazwa suwaka użyta jako słowo daje jego wartość (`np suw1`).
- **Słowa i listy, matematyka i logika:**
  - pełny zestaw z Logomocji;
  - `ascii`/`znak` według Windows-1250, jak w polskim Windowsie;
  - `losujOdNowa` ustala ziarno losowania, także dla każdego `jld`.
- **Wejście i wyjście:**
  - `pisz`, `pokaż`, `wpisz`, `czytajListę`, `czytajZnak`;
  - okienka dialogowe, `powiedz` (synteza mowy), `nuta`/`graj` (Web Audio);
  - pliki tekstowe, projekty `.lgm` i import `.imp`.
- **Komunikaty błędów** brzmią jak w Logomocji, np.:

  ```
  Nie wiem jak wykonać Ala
   Sprawdź pisownię. Może to nowe nieokreślone słowo
  ```

## Zgodność i znane różnice względem Logomocji na Windows

Ogólne:
- **Źródła nazw.** Część polskich nazw procedur nie występuje w żadnym dostępnym nam materiale
  Logomocji. W `docs/PRIMITYWY.md` takie nazwy mają znacznik `niezweryfikowane`; nadaliśmy je sami.
  Zawsze działa też angielska nazwa z Imagine.
- **Rozszerzenia.** Niektórych rzeczy nie ma w oryginale; mają znacznik `rozszerzenie`:
  - `^`, `potęga`, `log`, `pi`, `maks`, `min`, `wielkie`, `małe`, `zapytaj`, `odległość`;
  - zdarzenie `gdyKlawisz` w oknie głównym;
  - łączenie wierszy znakiem `~`;
  - jednowierszowe `oto … już`.

Rysowanie i grafika:
- **Prędkość.** Oryginał rysuje natychmiast. U nas jest to najwyższa pozycja suwaka prędkości
  („maks.”). Pozycje 1–10 pokazują ruch żółwia krok po kroku.
- **Kolory.** Odcienie z przyrostkami jasności 1–12 (np. `czerwony8`) są przybliżeniem HSL;
  oryginalna tabela około 200 kolorów nie jest znana. Kolejność palety 0–15 przyjęto za paletą VGA.
- **Linie.** Na płótnie przeglądarki ukośne linie są wygładzane, więc `kolorPodŻółwiem` na krawędzi
  linii może zwrócić kolor pośredni.
- **Wzory.** Wzory malowania (`ustalWzórMal` 1–7) są zapamiętywane, ale nie są rysowane.
- **Zakres widoczny.** `ustalWidocznyZakres` i `ustalPoczątek` są zapamiętywane, ale nie wpływają
  na rysowanie.
- **Pliki graficzne.** Postacie z plików `.lgf` z Logomocji nie są obsługiwane. Działają obrazy
  PNG/JPG, wbudowane postacie (`żółw`, `strzałka`, `trójkąt`, `kwadrat`, `gwiazda`, `koło`, `kursor`)
  oraz listy rysujące.
- **Projekty `.imp`** z Logomocji 2.0 importujemy tylko częściowo: wczytujemy procedury
  (`definiuj'…`). Obiekty, rysunki i binarny blok IMZ1 są pomijane.

Polecenia i zdarzenia:
- **Okna i system.** `pełnyEkran`, `drukujGrafikę`, `pokażDokument`, `zapiszTło` i `ładujTło`
  korzystają z mechanizmów przeglądarki. Ich działanie może się więc różnić: okno wyboru pliku,
  pobieranie pliku, nowa karta.
- **Myszka.** `ustalPozMyszy` tylko zapamiętuje pozycję, bo przeglądarka nie pozwala przesunąć kursora.
- **Klawisze** w `gdyKlawisz`, `ostatniKlawisz` i `czytajKlawisz` mają nazwy z przeglądarki
  (`ArrowLeft`, `Enter`, `a`), a nie kody z Windows.
- **Dane procedur.** `redaguj` i `zapiszProjekt` biorą nazwę bez nawiasów tylko wtedy, gdy jest
  słowem w cudzysłowie (`redaguj "kwadrat`). Tak samo `niech` z listą: `niech [a 1 b 2]`.
  Procedura `zwykle` z danymi wymaga nawiasów: `(zwykle :x)`.
- **Zatrzymanie.** `poziomGłówny` i `zakończ` przerywają wszystko bez komunikatu. Przycisk
  „Zatrzymaj” wypisuje `Zatrzymano!`.
- **Elementy interfejsu.** Zdarzenie przycisku albo suwaka (np. `gdyWciśnięty`) steruje aktywnymi
  żółwiami i stroną. Dlatego `ustalPoz` czy `ustalTło` w takim zdarzeniu działają na żółwia i stronę,
  a nie na przycisk. Sam przycisk zmieniasz zapisem apostrofowym: `prz1'ustalPoz [0 0]`.

Znane braki interpretera:
- **Rekurencja.** Rekurencja, która nie jest ogonowa (np. `wynik 1 + f :n - 1`), ma limit
  głębokości 10000 wywołań.
- **Nawiasy w listach.** W literałach list nawiasy okrągłe są wypisywane osobno:
  `pokaż [(a b)]` daje `[( a b )]`.
- **Nawiasy na kilku wierszach.** Nawiasy okrągłe nie mogą obejmować kilku wierszy, chyba że wiersze
  połączysz znakiem `~`.

## Struktura projektu

| ścieżka | zawartość |
|---|---|
| `index.html`, `styles.css`, `src/main.js`, `src/ui/` | interfejs |
| `src/logomocja.js` | fasada `createLogomocja({surface, io})` |
| `src/core/` | czytnik, parser, interpreter, wartości, błędy |
| `src/graphics/` | strona, żółw, kolory, kształty, powierzchnie rysowania |
| `src/prims/` | procedury pierwotne pogrupowane według rozdziałów `docs/PRIMITYWY.md` |
| `docs/` | słownik języka, architektura, notatki o API, kontrakt elementów interfejsu |
| `examples/` | przykładowe programy |
| `tests/` | testy (`node --test`) |
