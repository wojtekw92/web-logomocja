# Logomocja: słownik języka (procedury pierwotne)

Ten plik jest **jedynym źródłem prawdy o nazwach** w naszej przeglądarkowej implementacji Logomocji
(polskiej edycji Imagine Logo). Interfejsy kodu opisuje `docs/ARCHITEKTURA.md`.

## Jak czytać ten dokument

**Kolumny tabel z procedurami**

| kolumna | znaczenie |
|---|---|
| nazwa kanoniczna | Pierwsza nazwa przekazywana do `registry.define([...])`. |
| skróty/aliasy | Pozostałe nazwy, w tym **angielskie nazwy Imagine** (każda procedura ma alias angielski, więc kod z angielskiego Imagine też działa). Wszystkie nazwy bez rozróżniania wielkości liter. |
| wejścia | Liczba danych. `0..∞` oznacza procedurę wieloargumentową, wywoływaną w nawiasach `(lista 1 2 3)`. `1 (2)` znaczy: domyślnie 1, w nawiasach 2. |
| zwraca? | **F** to funkcja (zwraca wynik), **P** to polecenie, **P/F** to jedno i drugie zależnie od danych. |
| opis | Semantyka. |
| źródło/pewność | Jeden ze znaczników opisanych niżej. |

**Znaczniki pewności** (do wyszukiwania grepem)

| znacznik | znaczenie |
|---|---|
| `PL` | Polska nazwa widoczna w materiałach Logomocji: lekcje sp3.laziska.pl, msus.kylos.pl, rozwiązania LOGIA, pliki `.imp` z cauchy.pl, „Teraz bajty”, scenariusze lekcji. |
| `EN-help` | Semantyka z oryginalnej pomocy Imagine: pliki `TURTLES/CLASS/IMAGES/GLOSSARY.HLP` z imagineSKdemo.zip oraz z archive.org `imagine_202102`. |
| `wnioskowane` | Polska nazwa ustalona przez porównanie polskiego przykładu z angielskim przykładem z pomocy, linijka po linijce. |
| `niezweryfikowane` | Polskiej nazwy nie znaleziono; **nadaliśmy ją sami** w stylu Logomocji. Działa zawsze także alias angielski. |
| `rozszerzenie` | Czegoś takiego nie ma w oryginale. Dodajemy to dla wygody. |

**Ostrzeżenie o dialektach.** Część szkolnych materiałów miesza Logomocję z **Logo Komeniusz**
(starszym, innym produktem). Polecenia `oknożółwia`, `zapiszek`, `ufl`, `P`/`S` oraz domyślny tryb
`SKLEJ` w Komeniuszu nie są dowodem dla Logomocji. Gdy oba się różnią, wygrywa Logomocja.

**Najważniejszy otwarty trop.** Oficjalna tabela PL↔EN istnieje jako `Polish.ldx` w
https://imagine.input.sk/subory/ldx.zip, ale jest zaszyfrowana. Po jej odszyfrowaniu trzeba
zweryfikować wszystkie wiersze oznaczone `niezweryfikowane`.

**Rozstrzyganie konfliktów źródeł.** Polskie materiały Logomocji mają pierwszeństwo przed angielską
pomocą Imagine. Na przykład `koło` przyjmuje średnicę, a `powtórz 3.5` zaokrągla liczbę powtórzeń.

---

## 1. Składnia

### 1.1 Słowa, liczby, listy

| element | zapis | uwagi | źródło |
|---|---|---|---|
| słowo cytowane | `"kot` | `"` bez niczego to słowo puste | PL |
| liczba | `12`, `-3`, `1.5` | nie wymaga cudzysłowu. Patrz decyzja o przecinku dziesiętnym w §17. | PL |
| wartość zmiennej | `:bok` | „operator wartościowania”; to samo co `wartość "bok` | PL |
| lista | `[np 10 [a b]]` | `[]` to lista pusta. Lista może ciągnąć się przez wiele wierszy. | PL |
| słowo specjalne | `\|J. R.\|` | słowo ze spacjami i znakami specjalnymi | PL |
| znak ucieczki | `"ab\-9`, `\32` | `\` przed znakiem; `\liczba` to znak o kodzie | PL, EN-help |
| nowa linia w słowie | `¶` | `\13\10` zamienia się na `¶` | PL |
| nawiasy okrągłe | `(pisz "a "b "c)` | grupowanie oraz wywołania z inną liczbą danych | PL, EN-help |

### 1.2 Definicja procedury: `oto` … `już`

```
oto kwadrat :bok
  powtórz 4 [np :bok pw 90]
już
```

- `oto nazwa :p1 :p2 …`, potem wiersze treści, na końcu `już`. Odpowiednik angielski: `to … end`.
  `oto` i `już` rozpoznaje parser, a nie rejestr. Aliasy: `to`, `end`.
- Nazwa może zawierać litery polskie, `.`, `_`, cyfry i wielkie litery, np. `trj.prost.przeciwprostokątna`
  albo `UsuńLiteręOPodanymNumerze` (PL).
- Parametr opcjonalny lub zmienna liczba danych zapisujemy jak w Imagine: `oto podwój :co [1]`.
  Liczba w nawiasie to **domyślna liczba danych**. Procedurę można wtedy wywołać w nawiasach
  z inną liczbą danych. Brakujące parametry mają wartość pustą (EN-help).
- Na wierszu poleceń, w trakcie definiowania, znak zachęty zmienia się z `? ` na `> ` (EN-help).
- Procedura `starter` (wielkość liter dowolna) uruchamia się automatycznie po wczytaniu projektu (PL).
- Istnieją tylko „polecenia” i „funkcje”. `wynik` wolno użyć tylko w funkcji użytkownika,
  a `stop` tylko w procedurze (PL).

### 1.3 Składnia apostrofowa (adresowanie obiektów)

| zapis | znaczenie | źródło |
|---|---|---|
| `ż1'np 50` | obiekt `ż1` wykonuje `np 50`. Odpowiada `proszę "ż1 [np 50]`. | PL |
| `s3'ż4'np 30` | ścieżka: strona `s3`, w niej żółw `ż4` | PL |
| `pt1'ustalZawartość suw1` | wywołanie metody obiektu interfejsu | PL |
| `pokaż s1'wszystkie` | odczyt wartości lub funkcji obiektu | PL |
| `#1'...` | wewnętrzny zapis obiektu w plikach `.imp` | PL |

Między nazwą obiektu a poleceniem stoi apostrof **bez spacji**. Lexer zwraca `a'b'c` jako jedno słowo.
Postaci apostrofowej nie da się użyć z listą żółwi; do tego służy `proszę` (EN-help).

### 1.4 Komentarze

- Komentarz zaczyna się od `;` i trwa do końca wiersza.
- Jedno źródło (PL, laziska) mówi, że `;` musi zaczynać wiersz. Oficjalne rozwiązania LOGIA
  używają jednak komentarzy po kodzie (`niech "stan 13 ;Logo`), więc **dopuszczamy oba warianty**.
- `~` na końcu wiersza łączy go z następnym. To konwencja innych dialektów Logo (`rozszerzenie`).

### 1.5 Operatory wrostkowe i priorytety

| priorytet (od najwyższego) | operatory | uwagi |
|---|---|---|
| 1 | jednoargumentowy `-` | `-:x`, `- 3` |
| 2 | `^` | **`rozszerzenie`**. Logomocja nie ma potęgowania: „nie zawiera funkcji pierwotnej, która podnosiłaby dowolną liczbę do potęgi” (PL). |
| 3 | `*` `/` | `/` przez 0 to błąd |
| 4 | `+` `-` | |
| 5 | `=` `<` `>` `<=` `>=` `<>` | porównania zwracają `prawda` albo `fałsz`. `=` porównuje też słowa (bez wielkości liter) i listy. |

Inne zasady:
- Operatory arytmetyczne działają też na wektorach i punktach: `[25 17 50] - [10 10 10]` daje `[15 7 40]`,
  a `poz + [25 35]` działa. Są tu dwa przypadki:
  - lista z listą: działanie po elementach;
  - liczba z listą: działanie z każdym elementem (EN-help).
- Wywołanie przedrostkowe procedury pierwotnej wiąże słabiej niż wrostek: `np 10 + 20` to `np 30`.
- **Minus.** `pisz 7-3` daje `4`. `pisz 7 -3` drukuje `7`, a potem zgłasza błąd „Nie wiem co zrobić z -3” (PL).
  Reguła: `-` ze spacją przed sobą i **bez** spacji za sobą zaczyna nowe wyrażenie (liczbę ujemną).
- Między nazwą a daną musi być spacja: `pw40` to błąd „Nie wiem jak wykonać pw40” (PL).

### 1.6 Wartość losowa `jld`

`jld` („jak los da”, ang. `any`) można podać tam, gdzie procedura dopuszcza wartość losową.
Zakresy domyślne:

| użycie | zakres |
|---|---|
| kolor | dowolny kolor |
| `prawo`/`lewo` | 1–90 |
| `naprzód`/`wstecz` | 1–100 |
| `ustalGrubość` | 1–20 |
| kierunek | 0–359 |
| pozycja | dowolny punkt strony |
| wartość logiczna | 0.5 |

Dozwolone są też listy z elementami losowymi: `[jld jld jld]` i `[120 jld 70]` (PL, EN-help).

---

## 2. Żółw i grafika

Ogólne zasady (PL, EN-help):
- Krok to 1 piksel. Kąty są w stopniach, zgodnie z ruchem wskazówek zegara, 0 = północ.
- Polecenie żółwia wykonują **równolegle wszystkie aktywne żółwie** (`kto`).
- Funkcja żółwia zwraca wartość **pierwszego aktywnego żółwia**.

### 2.1 Ruch i obrót

| nazwa kanoniczna | skróty/aliasy | wejścia | zwraca? | opis | źródło/pewność |
|---|---|---|---|---|---|
| naprzód | np, forward, fd | 1 | P | Przesuwa aktywne żółwie o n kroków. Rysuje zgodnie ze stanem pisaka i respektuje zakres. `np 0` rysuje punkt 1 px. `np n` ≡ `ws -n`. Przyjmuje `jld`. | PL, EN-help |
| wstecz | ws, back, bk | 1 | P | Ruch do tyłu. | PL, EN-help |
| prawo | pw, right, rt | 1 | P | Obrót zgodnie z ruchem wskazówek zegara. `pw -a` ≡ `lw a`. Przyjmuje `jld`. Bez danej w IDE otwiera okno wyboru kąta. | PL, EN-help |
| lewo | lw, left, lt | 1 | P | Obrót przeciwnie do ruchu wskazówek zegara. `lw 390` ≡ `lw 30`. | PL, EN-help |
| wróć | home | 0 | P | Każdy aktywny żółw wraca do `stanPoczątkowy` (pozycja i kierunek) **bez rysowania**. Ekran nie jest czyszczony. | PL |
| suń | glide | 2 | P | Żółw jedzie po obrysie listy rysującej. Druga dana to lista ustawień `[co N rób [lista] czekaj ms]`; listę `rób` wykonuje co N kroków. `[]` znaczy `[co 5 rób [czekaj 30]]`. Klucze `co`/`rób` są wnioskowane. Klucz `czekaj` (ang. `wait`) jest niezweryfikowany. Klucze ang. `step`/`toDo`/`wait` też działają. | PL (przykłady), wnioskowane |

### 2.2 Pozycja i kierunek

| nazwa kanoniczna | skróty/aliasy | wejścia | zwraca? | opis | źródło/pewność |
|---|---|---|---|---|---|
| ustalPoz | naPoz, setPos | 1 | P | Przesuwa żółwia do punktu `[x y]`. Rysuje, gdy pisak jest opuszczony. Kierunek się nie zmienia. Przyjmuje `jld` i `[jld jld]`. | PL |
| poz | pos | 0 | F | `[x y]` pierwszego aktywnego żółwia. Jest też ustawieniem w liście `nowy`. | PL |
| pozx | xcor | 0 | F | Współrzędna x. | PL (lista skrótów) |
| pozy | ycor | 0 | F | Współrzędna y. | PL (lista skrótów) |
| ustalPozx | setXcor, setX | 1 | P | Ustala x. Rysuje, gdy pisak jest opuszczony. | PL (lista skrótów) |
| ustalPozy | setYcor, setY | 1 | P | Ustala y. | PL (lista skrótów) |
| ustalXY | setXY | 2 | P | Ustala obie współrzędne. | EN-help, niezweryfikowane |
| kierunek | heading | 0 | F | Kierunek w stopniach, od 0 do 360 (bez 360). Jest też ustawieniem w liście `nowy`. | PL |
| ustalKierunek | skieruj, skier, setHeading, setH | 1 | P | `ustalKierunek 0` to północ, `90` to wschód. Przyjmuje `jld`. | PL |
| kierunekDo | towards | 1 | F | Kierunek do punktu albo do żółwia (nazwy). | EN-help, niezweryfikowane |
| stanPoczątkowy | homeState | 0 | F | `[[x y] kierunek]`, domyślnie `[[0 0] 0]`. | EN-help, niezweryfikowane |
| ustalStanPoczątkowy | setHomeState | 1 | P | Ustala stan, do którego wracają `wróć` i `czyść`. | EN-help, niezweryfikowane |
| pozA | aPos | 0 | F | Pozycja bezwzględna: piksele od lewego górnego rogu, oś y w dół. | EN-help, niezweryfikowane |
| ustalPozA | setAPos | 1 | P | Ustala pozycję bezwzględną. | EN-help, niezweryfikowane |
| pozMyszy | mousePos | 0 | F | Pozycja myszy we współrzędnych strony. | PL (`nowy "Ptaszek [poz (pozmyszy)]`) |
| ustalPozMyszy | setMousePos | 1 | P | W przeglądarce nie działa. Wywołanie tylko zapamiętuje pozycję. | EN-help, niezweryfikowane |
| odległość | distance | 1 | F | Odległość od punktu albo żółwia. | rozszerzenie |

### 2.3 Pisak

Ustawienia pisaka są zapamiętywane jako ustawienia żółwia `pisak`, `kolpis`, `grubość`, `wzórpis` (PL).

| nazwa kanoniczna | skróty/aliasy | wejścia | zwraca? | opis | źródło/pewność |
|---|---|---|---|---|---|
| podnieś | pod, penUp, pu | 0 | P | Żółw nie zostawia śladu. | PL |
| opuść | opu, penDown, pd | 0 | P | Żółw rysuje. Stan domyślny. | PL |
| ścieraj | ścier, penErase, pe | 0 | P | Żółw ściera do koloru tła, szerokością pisaka. | PL |
| odwracaj | penReverse, px | 0 | P | Rysuje w trybie XOR: zamienia kolor pisaka z kolorem tła. | EN-help, niezweryfikowane |
| pisak | pen | 0 | F | Zwraca jedno ze słów `opu`/`pod`/`ścier`/`odwr`. Na wejściu przyjmuje też ang. `pd`/`pu`/`pe`/`px`. | PL (ustawienie `pisak pod`), EN-help |
| ustalPisak | setPen | 1 | P | Ustala stan pisaka słowem: `pod`, `opu`, `ścier`, `odwr` lub angielskim odpowiednikiem. | EN-help, niezweryfikowane |
| ustalKolPis | ukp, setPenColour, setPenColor, setPC | 1 | P | Ustala kolor pisaka (formy koloru w §3). **Ustawia też kolor malowania** na ten sam kolor. Bez danej w IDE otwiera okno wyboru. | PL, EN-help |
| kolPis | penColour, penColor, pc | 0 | F | Kolor pisaka: liczba 0–15, gdy kolor jest w palecie, inaczej lista RGB. | PL (nazwa ustawienia), EN-help |
| ustalGrubość | ugp, setPenWidth, setPW | 1 | P | Grubość w pikselach. Wartość < 1 zamienia się na 1. **Bez górnego limitu** (używa się `ugp 20`). Grubość > 5 daje zaokrąglone końce. `jld` daje 1–20. | PL, EN-help |
| grubość | penWidth | 0 | F | Grubość pisaka. **Nie ma aliasu `pw`**, bo `pw` to `prawo`. | PL (nazwa ustawienia) |
| ustalWzórPis | uwp, setPenPattern, setPP | 1 | P | Wzór 0–6: 0 to linia ciągła (domyślnie), 6 to linia niewidoczna. Wzory 1–5 działają tylko przy grubości 1. | PL, EN-help |
| wzórPis | penPattern, pp, pattern | 0 | F | Wzór pisaka. | PL (nazwa ustawienia) |

### 2.4 Malowanie (wypełnianie)

| nazwa kanoniczna | skróty/aliasy | wejścia | zwraca? | opis | źródło/pewność |
|---|---|---|---|---|---|
| zamaluj | zam, fill | 0 | P | Każdy aktywny żółw zamalowuje obszar wokół siebie kolorem i wzorem malowania, w granicach swojego zakresu. Jest to flood fill **po kolorze piksela pod żółwiem**, więc żółw stojący na linii zmienia jej kolor. Nie wymaga podniesionego pisaka. | PL, EN-help |
| ustalKolMal | ukm, ustalKolZam, setFillColour, setFillColor, setFC | 1 | P | Ustala kolor malowania dla `zamaluj`, `wielokąt` i `koło`. **Używaj po `ukp`**, bo `ukp` nadpisuje kolor malowania. Nazwa `ustalKolZam` występuje raz (PL laziska) i traktujemy ją jako alias. | PL |
| kolMal | fillColour, fillColor, fc | 0 | F | Kolor malowania. | EN-help, niezweryfikowane |
| ustalWzórMal | uwm, setFillPattern, setFP | 1 | P | Wzór malowania 0–7, domyślnie 0 (pełny). | PL, EN-help |
| wzórMal | fillPattern, fp | 0 | F | Wzór malowania. | EN-help, niezweryfikowane |
| kolorPodŻółwiem | dotColour, dotColor | 0 | F | Kolor piksela pod pierwszym aktywnym żółwiem. | EN-help, niezweryfikowane |

### 2.5 Kształty rysowane w jednym kroku (żółw stoi w miejscu)

Wszystkie kształty są środkowane na żółwiu, obrócone zgodnie z jego kierunkiem i przycięte do zakresu.

**Lista rysująca** może mieć jedną z dwóch postaci:
- lista instrukcji, np. `[powtórz 3 [np 50 pw 120]]`;
- zapis zwarty `[n [d1 a1 d2 a2 …]]`, czyli n razy: `np d1 pw a1 np d2 pw a2 …`. Przykłady: `[4 [100 90]]` to kwadrat, `[2 [9 90 20 90]]` to prostokąt. Zapis zwarty jest wnioskowany.

| nazwa kanoniczna | skróty/aliasy | wejścia | zwraca? | opis | źródło/pewność |
|---|---|---|---|---|---|
| okrąg | circle | 1 | P | Okrąg o podanej **średnicy**, w kolorze i grubości pisaka. | PL, EN-help |
| koło | filledCircle | 1 | P | Koło wypełnione kolorem malowania, o podanej **średnicy** (PL). Obwód ma kolor pisaka. | PL |
| kropka | point | 1 | P | Pełne koło o średnicy d w kolorze pisaka. | wnioskowane |
| pkt | dot | 0 | P | Punkt w miejscu żółwia, w kolorze i grubości pisaka, **nawet przy podniesionym pisaku**. | wnioskowane |
| elipsa | ellipse | 1 | P | `[a b]` albo `[a b kąt1 kąt2]` dla łuku. Półosie a, b liczone względem kierunku żółwia. | EN-help, niezweryfikowane |
| elipsaZamalowana | filledEllipse | 1 | P | Elipsa wypełniona kolorem malowania. | EN-help, niezweryfikowane |
| wielokąt | polygon | 1 | P | Wypełniony wielokąt z listy rysującej; ścieżka jest domykana automatycznie. Ustawienia pisaka i koloru mają znaczenie tylko na początku listy. Fragmenty `pod … opu` stają się zwykłą linią. Okręgi i kropki w liście są pomijane. | PL, EN-help |
| rysuj | drawList | 1 | P | Rysuje listę rysującą bez przesuwania żółwia. | PL |
| obrys | outline | 1 | P | Łamana przez listę punktów. | EN-help, niezweryfikowane |
| krzywa | spline | 1 | F | Wygładzona lista punktów (krzywa sklejana). | EN-help, niezweryfikowane |
| rysujKrzywą | drawSpline | 1 | P | Rysuje krzywą przez punkty. | EN-help, niezweryfikowane |
| naPunkty | toPoints | 1 | F | Zamienia listę rysującą na listę punktów. | EN-help, niezweryfikowane |
| naWektory | toVectors | 1 | F | Zamienia listę rysującą na listę wektorów. | EN-help, niezweryfikowane |

### 2.6 Tekst na stronie

| nazwa kanoniczna | skróty/aliasy | wejścia | zwraca? | opis | źródło/pewność |
|---|---|---|---|---|---|
| napisz | label, setTT, ttext | 1 | P | Pisze tekst w kolorze pisaka, w miejscu żółwia, prostopadle do kierunku (poziomo, gdy żółw patrzy na północ). `¶` łamie wiersz. **To nie jest `pisz`**: `pisz` pisze w polu tekstowym. | EN-help, niezweryfikowane |
| napisz2 | label2 | 1 | P | Jak `napisz`, ale żółw przesuwa się na koniec tekstu. | EN-help, niezweryfikowane |
| ustalCzcionkę | setFont | 1 | P | `[[Nazwa] [rozmiar grubość kursywa podkreślenie przekreślenie zestaw]]`. Domyślnie `[[System] [0 400 0 0 0 1]]`. Rozmiar 0 oznacza domyślny (przyjmujemy 13 px). | EN-help, niezweryfikowane |
| czcionka | font | 0 | F | Bieżąca czcionka. | EN-help, niezweryfikowane |
| rozmiarTekstu | textSize | 1 | F | `[szer wys]` tekstu w bieżącej czcionce. | EN-help, niezweryfikowane |

### 2.7 Widoczność, zakres, styl zakresu

Styl zakresu ma cztery wartości:

| słowo | ang. | zachowanie | domyślny? | pewność |
|---|---|---|---|---|
| `sklej` | `wrap` | żółw pojawia się po przeciwnej stronie | **tak** | wnioskowane z pliku `.imp`: `50 sklej` |
| `okno` | `window` | żółw wychodzi poza zakres, ale tam nie rysuje | nie | niezweryfikowane |
| `płot` | `fence` | żółw zatrzymuje się na krawędzi | nie | niezweryfikowane |
| `odbij` | `bounce` | żółw odbija się jak kula bilardowa | nie | PL, tylko interfejs: „Zakres poruszania się… Odbij” |

| nazwa kanoniczna | skróty/aliasy | wejścia | zwraca? | opis | źródło/pewność |
|---|---|---|---|---|---|
| pokażMnie | pż, showTurtle, st, showMe | 0 | P | Pokazuje aktywne żółwie. | PL |
| schowajMnie | sż, hideTurtle, ht, hideMe | 0 | P | Chowa aktywne żółwie. Ukryty żółw dalej rysuje. | PL |
| widoczny | widoczny?, shown, shown? | 0 | F | `prawda` albo `fałsz`. Jest też ustawieniem (`widoczny fałsz`). | PL (ustawienie) |
| ustalWidoczny | setShown | 1 | P | Pokazuje albo chowa według wartości logicznej. | EN-help, niezweryfikowane |
| ustalStylZakresu | setRangeStyle | 1 | P | Przyjmuje `sklej`, `okno`, `płot` lub `odbij` (albo ang. odpowiednik). | EN-help, niezweryfikowane |
| stylZakresu | rangeStyle | 0 | F | Bieżący styl zakresu. | EN-help, niezweryfikowane |
| ustalZakres | setRange | 1 | P | Prostokąt `[x1 y1 x2 y2]`, w którym działa żółw. `[]` oznacza całą stronę. | EN-help, niezweryfikowane |
| zakres | range | 0 | F | Bieżący zakres. | EN-help, niezweryfikowane |
| sklej | wrap | 0 (1) | P | Ustala styl `sklej`. W nawiasach przyjmuje też prostokąt: `(sklej [..])`. | PL (kod laziska), EN-help |
| okno | window | 0 (1) | P | Ustala styl `okno`. | EN-help, niezweryfikowane |
| płot | fence | 0 (1) | P | Ustala styl `płot`. | niezweryfikowane |
| odbij | bounce | 0 (1) | P | Ustala styl `odbij`. | niezweryfikowane |
| ustalWidocznyZakres | setShownRange | 1 | P | Prostokąt, w którym żółw jest widoczny. | EN-help, niezweryfikowane |
| widocznyZakres | shownRange | 0 | F | Bieżący widoczny zakres. | EN-help, niezweryfikowane |
| wewnątrz? | inside? | 1 | F | Czy żółw jest w prostokącie. | EN-help, niezweryfikowane |
| zewnątrz? | outside? | 1 | F | Czy żółw jest poza prostokątem. | EN-help, niezweryfikowane |

### 2.8 Postać żółwia, stemplowanie, animacja

Domyślna postać to zielony żółw (PL).

| nazwa kanoniczna | skróty/aliasy | wejścia | zwraca? | opis | źródło/pewność |
|---|---|---|---|---|---|
| ustalPostać | setShape | 1 | P | Przyjmuje plik `.lgf`/obraz, listę rysującą, listę list rysujących (animacja) albo `[]` (domyślny żółw). | PL |
| postać | shape | 0 | F | Bieżąca postać. Jest też ustawieniem w liście `nowy`. | PL |
| stempluj | stamp | 0 | P | Odciska bieżącą klatkę postaci na tle strony. | PL (przycisk edytora), niezweryfikowane |
| stemplujObraz | stampPicture | 1 | P | Odciska obraz albo listę rysującą. | EN-help, niezweryfikowane |
| weźObraz | getImage | 1 | F | Wycina obraz z prostokąta tła. | EN-help, niezweryfikowane |
| ustalSkalęPostaci | setShapeScale | 1 | P | `n` albo `[sx sy]`. | EN-help, niezweryfikowane |
| skalaPostaci | shapeScale | 0 | F | Bieżąca skala postaci. | EN-help, niezweryfikowane |
| ustalKolPostaci | setShapeColour, setShapeColor | 1 | P | Przebarwia postać. `[]` przywraca oryginał. | EN-help, niezweryfikowane |
| kolPostaci | shapeColour, shapeColor | 0 | F | Kolor przebarwienia postaci. | EN-help, niezweryfikowane |
| ustalKlatkę | setFrame | 1 | P | Numer klatki animacji. | EN-help, niezweryfikowane |
| klatka | frame | 0 | F | Bieżąca klatka. | EN-help, niezweryfikowane |
| ustalAnimację | setAnimation | 1 | P | Włącza lub wyłącza automatyczną animację. | EN-help, niezweryfikowane |
| animacja | animation | 0 | F | Czy animacja jest włączona. | EN-help, niezweryfikowane |
| ustalSkalęOpóźnienia | setDelayScale | 1 | P | Mnożnik opóźnień klatek. | EN-help, niezweryfikowane |
| skalaOpóźnienia | delayScale | 0 | F | Bieżący mnożnik. | EN-help, niezweryfikowane |
| naWierzch | toFront | 0 | P | Żółw na wierzch warstwy. | EN-help, niezweryfikowane |
| naSpód | toBack | 0 | P | Żółw na spód. | EN-help, niezweryfikowane |
| nachodzi? | overlap? | 1 | F | Czy postać nachodzi na żółwia lub listę żółwi. | EN-help, niezweryfikowane |
| listaNachodzących | overlapList | 0 | F | Żółwie, na które nachodzi postać. | EN-help, niezweryfikowane |

---

## 3. Kolory

### 3.1 Formy koloru (wszędzie, gdzie oczekiwany jest kolor)

1. **Liczba 0–15**: indeks palety podstawowej (§3.2).
2. **Nazwa koloru Imagine** z opcjonalnym przyrostkiem jasności 1–12, np. `czerwony`, `czerwony11`,
   `ciemnoniebieski2`, `red5`. Wielkość liter nie ma znaczenia (§3.3, §3.4).
3. **Lista RGB** `[R G B]` z wartościami 0–255, np. `[128 128 0]`.
4. **`jld`** albo `[jld jld jld]`, albo częściowo losowa, np. `[120 jld 70]`.

Funkcje zwracające kolor (`kolPis`, `kolMal`, `kolTła`) zwracają liczbę 0–15, gdy kolor jest w palecie.
W przeciwnym razie zwracają listę RGB. Weryfikacja w EN-help: po `setPC "grey9` funkcja `show PC` daje `7`.

### 3.2 Paleta podstawowa 0–15

Kolejność palety jest tylko na obrazku w pomocy. Przyjmujemy kolejność 16 kolorów VGA z Windows (Delphi).
Zgadza się ona z dwoma punktami kontrolnymi z EN-help:
- `setFC "yellow` → `setfc 14`, więc 14 = żółty;
- `grey9` = `[192 192 192]` → 7.

Pozostałe wpisy są `niezweryfikowane`.

| nr | nazwa PL (słowo) | ang. | RGB hex | pewność |
|---|---|---|---|---|
| 0 | czarny | black | `#000000` | niezweryfikowane |
| 1 | ciemnoniebieski | darkBlue (navy) | `#000080` | niezweryfikowane |
| 2 | ciemnozielony | darkGreen | `#008000` | niezweryfikowane |
| 3 | morski (teal) | — | `#008080` | niezweryfikowane |
| 4 | bordowy (maroon) | — | `#800000` | niezweryfikowane |
| 5 | fioletowy | purple | `#800080` | niezweryfikowane |
| 6 | oliwkowy | olive | `#808000` | niezweryfikowane |
| 7 | jasnoszary | lightGrey (= grey9) | `#C0C0C0` | EN-help (punkt kontrolny) |
| 8 | szary | grey | `#808080` | niezweryfikowane |
| 9 | niebieski | blue | `#0000FF` | niezweryfikowane |
| 10 | zielony (limonkowy) | green | `#00FF00` | niezweryfikowane |
| 11 | błękitny | cyan | `#00FFFF` | niezweryfikowane |
| 12 | czerwony | red | `#FF0000` | niezweryfikowane |
| 13 | purpurowy | magenta | `#FF00FF` | niezweryfikowane |
| 14 | żółty | yellow | `#FFFF00` | EN-help (punkt kontrolny) |
| 15 | biały | white | `#FFFFFF` | niezweryfikowane |

### 3.3 Nazwy kolorów Imagine (18 + jasnoszary)

`kolory`/`ImagineColours` zwraca nazwy w tej kolejności:
`[biały czarny purpurowy różowy fioletowy ciemnoniebieski niebieski jasnoniebieski błękitny ciemnozielony zielony oliwkowy żółty pomarańczowy brązowy jasnoczerwony czerwony szary]`.

Nazwy z przyrostkiem 6 są równe nazwom bez przyrostka. Zachodzą też tożsamości:
- `biały` = `szary12`,
- `czarny` = `szary1`,
- `jasnoszary` = `szary9`.

| nazwa PL | aliasy ang. | RGB bazowe (=…6) | pewność nazwy PL | pewność RGB |
|---|---|---|---|---|
| biały | white | `#FFFFFF` | PL | pewne |
| czarny | black | `#000000` | PL | pewne (EN-help `toRGB "black`) |
| purpurowy | magenta | `#FF00FF` | niezweryfikowane | przybliżone |
| różowy | pink | `#FF80C0` | niezweryfikowane | przybliżone |
| fioletowy | purple | `#8000C0` | niezweryfikowane | przybliżone |
| ciemnoniebieski | darkBlue | `#000080` | PL | przybliżone |
| niebieski | blue | `#0000FF` | PL | przybliżone |
| jasnoniebieski | paleBlue | `#0CB0F4` | PL (mapowanie wnioskowane) | wyliczone z `paleBlue8` = `[104 208 248]` (EN-help) |
| błękitny | cyan | `#00FFFF` | niezweryfikowane | przybliżone |
| ciemnozielony | darkGreen | `#008000` | niezweryfikowane | przybliżone |
| zielony | green | `#00C000` | PL (tekst lekcji) | przybliżone |
| oliwkowy | olive | `#808000` | PL | przybliżone |
| żółty | yellow | `#FFFF00` | PL | przybliżone |
| pomarańczowy | orange | `#FF8000` | niezweryfikowane | przybliżone |
| brązowy | taupe | `#8C6A4F` | niezweryfikowane (ang. *taupe* to szarobrązowy) | przybliżone |
| jasnoczerwony | paleRed | `#FF6060` | PL (mapowanie wnioskowane) | przybliżone |
| czerwony | red | `#FF0000` | PL | pewne co do tonu: `red8` = `[255 104 104]` (EN-help) |
| szary | grey, gray | `#808080` | niezweryfikowane | przybliżone |
| jasnoszary | lightGrey, lightGray | `#C0C0C0` | niezweryfikowane | EN-help: `grey9` = `[192 192 192]` |

### 3.4 Przyrostki jasności 1–12 (algorytm implementacji)

Imagine ma około 200 nazwanych kolorów. Oryginalna tabela jest nieznana, więc stosujemy **przybliżenie HSL**:
- odcień (H) i nasycenie (S) bierzemy z koloru bazowego;
- jasność (L) bierzemy z tabeli poniżej.

| przyrostek | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| L | 0.08 | 0.16 | 0.25 | 0.33 | 0.42 | baza | 0.60 | 0.705 | 0.75 | 0.82 | 0.89 | 0.95 |

Wyjątki i testy:
- **Rodzina `szary`**: `szary1` = `#000000`, `szary12` = `#FFFFFF`, `szary9` = `#C0C0C0`.
- **Wartości kontrolne do testów**:
  - `czerwony8` → `[255 104 104]` (±3),
  - `jasnoniebieski8` → `[104 208 248]` (±6),
  - `szary9` → `[192 192 192]`.

Wszystkie wartości pośrednie są `niezweryfikowane`.

| nazwa kanoniczna | skróty/aliasy | wejścia | zwraca? | opis | źródło/pewność |
|---|---|---|---|---|---|
| kolory | ImagineColours, ImagineColors | 0 | F | Lista 18 nazw kolorów bazowych (§3.3). | EN-help, niezweryfikowane (nazwa PL) |
| naRGB | toRGB | 1 | F | Zamienia dowolny kolor na `[R G B]`. | EN-help, niezweryfikowane |

---

## 4. Strona, tło i okno główne

**Domyślna strona `s1`** (PL `.imp`, EN-help):
- rozmiar **796 × 499**, początek układu w środku;
- tło białe;
- linia tła: czarna, grubość 1, wzór 0.

| nazwa kanoniczna | skróty/aliasy | wejścia | zwraca? | opis | źródło/pewność |
|---|---|---|---|---|---|
| czyść | cs, clearScreen | 0 | P | Wypełnia stronę kolorem tła i **odsyła wszystkie żółwie tej strony** do `stanPoczątkowy`, bez rysowania. Nie zmienia pisaka (kolor, grubość, wzór, stan). Uruchamia zdarzenie strony `gdyCzyść`. | PL, EN-help |
| zmaż | clean, cleanBgPicture, cbg | 0 | P | Tylko wypełnia stronę tłem. Żółwie się nie ruszają. | PL |
| odnowa | reset | 0 | P | „Zresetuj ekran”. Implementacja: usuwa wszystkie żółwie poza `ż1`, ustawia jego stan domyślny, przywraca domyślne tło i czyści stronę. Procedury zostają. | PL (lista nauczycielska), niezweryfikowane |
| ustalKolTła | ustalTło, setBgColour, setBgColor, setBg | 1 | P | Ustala kolor tła strony **i ją czyści**. Żółwie się nie zmieniają. | PL |
| kolTła | bgColour, bgColor, bg | 0 | F | Kolor tła. | EN-help, niezweryfikowane |
| ustalRozmiar | setSize | 1 | P | `[szer wys]` strony. | EN-help, niezweryfikowane |
| rozmiar | size | 0 | F | `[szer wys]`, domyślnie `[796 499]`. | EN-help |
| ustalPoczątek | setOrigin | 1 | P | Przesuwa początek układu współrzędnych. | EN-help, niezweryfikowane |
| początek | origin | 0 | F | Bieżący początek układu. | EN-help, niezweryfikowane |
| lewyGórny | upperLeft | 0 | F | Współrzędne lewego górnego rogu. | EN-help, niezweryfikowane |
| ustalObrazTła | setBgPicture | 1 | P | Obraz, lista rysująca albo plik jako tło. | EN-help, niezweryfikowane |
| obrazTła | bgPicture | 0 | F | Bieżący obraz tła. | EN-help, niezweryfikowane |
| ładujTło | loadBgPicture | 1 | P | Wczytuje obraz tła (menu „Strona/Ładuj tło”). | PL (menu), niezweryfikowane |
| zapiszTło | saveBgPicture | 1 | P | Zapisuje tło do pliku (pobranie w przeglądarce). | EN-help, niezweryfikowane |
| zrzutTła | takePicture | 1 | F | Obraz prostokąta tła. | EN-help, niezweryfikowane |
| wstawObraz | putPicture | 2 | P | Wkleja obraz w punkcie. | EN-help, niezweryfikowane |
| kolorPunktuW | dotColourAt, dotColorAt | 1 | F | Kolor tła w punkcie. | EN-help, niezweryfikowane |
| ustalKolLiniiTła | setBgLineColour, setBgLineColor | 1 | P | Kolor pisaka „bez żółwia”. | EN-help, niezweryfikowane |
| ustalGrubośćLiniiTła | setBgLineWidth | 1 | P | Grubość pisaka „bez żółwia”. | EN-help, niezweryfikowane |
| ustalWzórLiniiTła | setBgLinePattern | 1 | P | Wzór pisaka „bez żółwia”. | EN-help, niezweryfikowane |
| liniaTła | bgLine | 1 | P | `[[x1 y1] [x2 y2]]`. | EN-help, niezweryfikowane |
| prostokątTła | bgRectangle | 1 | P | Obrys prostokąta `[x1 y1 x2 y2]`. | EN-help, niezweryfikowane |
| pełnyProstokątTła | bgFilledRectangle | 1 | P | Wypełniony prostokąt. | EN-help, niezweryfikowane |
| elipsaTła | bgEllipse | 1 | P | Elipsa wpisana w `[p1 p2]`. | EN-help, niezweryfikowane |
| pełnaElipsaTła | bgFilledEllipse | 1 | P | Wypełniona elipsa. | EN-help, niezweryfikowane |
| zamalujTło | bgFill | 1 | P | Wypełnia od punktu kolorem linii tła. | EN-help, niezweryfikowane |
| nowaStrona | newPage | 0 (1) | P | Tworzy stronę `s2`, `s3`, … albo o podanej nazwie. | EN-help, niezweryfikowane |
| pokażStronę | showPage | 1 | P | Przełącza widok na stronę. | EN-help, niezweryfikowane |
| usuńStronę | erasePage | 1 | P | Usuwa stronę. | EN-help, niezweryfikowane |
| listaStron | pageList | 0 | F | Nazwy stron. | EN-help, niezweryfikowane |
| aktywnaStrona | activePage | 0 | F | Nazwa bieżącej strony. | EN-help, niezweryfikowane |
| eg | ekranGraficzny, graphicScreen, gs | 0 | P | Okno główne pokazuje tylko ekran graficzny. | PL |
| ekranTekstowy | textScreen, ts | 0 | P | Pokazuje tylko pole tekstowe. | EN-help, niezweryfikowane |
| ekranDzielony | splitScreen, ss | 0 | P | Grafika i tekst razem (stan domyślny). | EN-help, niezweryfikowane |
| pełnyEkran | fullScreen | 0 | P | Tryb pełnoekranowy przeglądarki. | EN-help, niezweryfikowane |
| czyśćTekst | ct, clearText | 0 | P | Czyści pole tekstowe (wyjście). | EN-help, niezweryfikowane |
| drukujGrafikę | printGraphics | 0 | P | `window.print()` samej strony. | EN-help, niezweryfikowane |

---

## 5. Zmienne

- Zakres widoczności jest **dynamiczny**. Zmienna utworzona przez `niech` jest widoczna w procedurze i we wszystkich procedurach, które ta procedura wywołuje (PL).
- Zmienne i procedury mają **osobne przestrzenie nazw**. Zmienna może się nazywać `wynik`, `znak` albo `licznik` (PL).

| nazwa kanoniczna | skróty/aliasy | wejścia | zwraca? | opis | źródło/pewność |
|---|---|---|---|---|---|
| przypisz | przyp, make | 2 | P | `przypisz "x 5`. Ustawia istniejącą zmienną (lokalną z łańcucha dynamicznego, potem zmienną obiektu); gdy takiej nie ma, tworzy lub ustawia **globalną**. | PL |
| niech | let | 2 (0..∞), albo 1 lista | P | `niech "a 5` tworzy zmienną **lokalną** w bieżącej procedurze i nadaje jej wartość. Inne formy: `(niech "a 1 "b 2)` oraz, dla zgodności z Imagine, `niech [a 1 b 2]`. Gdy jedyna dana jest listą, traktujemy ją jako listę par. | PL, EN-help |
| lokalna | local | 1 (1..∞) | P | Deklaruje zmienne lokalne bez wartości. Przyjmuje słowo albo listę słów. | EN-help, niezweryfikowane |
| nazwij | name | 2 | P | `nazwij 5 "x`. To samo co `przypisz`, ale z **odwróconą kolejnością danych**. | EN-help, niezweryfikowane |
| wartość | thing, get | 1 | F | `wartość "x` ≡ `:x`. | EN-help, niezweryfikowane |
| zwiększ | inc | 1 (2) | P | `zwiększ "x` dodaje 1; `(zwiększ "x 4)` dodaje 4. | PL |
| zmniejsz | dec | 1 (2) | P | Odejmuje 1 albo n. | PL |
| nazwa? | name? | 1 | F | Czy zmienna istnieje. | EN-help, niezweryfikowane |
| usuń | erase, er | 1 | P | Usuwa procedurę albo listę procedur. `usuń ":x` usuwa zmienną. | EN-help, niezweryfikowane |
| usuńWszystko | erAll, eraseAll | 0 | P | Usuwa wszystkie procedury i zmienne użytkownika. | EN-help, niezweryfikowane |
| miejWłasną | haveOwn | 2 | P | Tworzy **zmienną własną obiektu** (`self`) z wartością. Automatycznie powstają funkcja `nazwa` i polecenie `ustalNazwa`. | EN-help, niezweryfikowane |
| miejWspólną | haveCommon | 2 | P | Tworzy zmienną wspólną klasy. | EN-help, niezweryfikowane |
| ustaw | set | 2 | P | Ustawia ustawienie lub zmienną obiektu. `ustaw "kierunek 90` ≡ `ustalKierunek 90`. | EN-help, niezweryfikowane |
| ustalWłaściwość | pProp | 3 | P | Lista właściwości: `ustalWłaściwość "lista "klucz wartość`. | EN-help, niezweryfikowane |
| właściwość | gProp | 2 | F | Wartość właściwości (lub `[]`). | EN-help, niezweryfikowane |
| usuńWłaściwość | remProp | 2 | P | Usuwa właściwość. | EN-help, niezweryfikowane |
| listaWłaściwości | pList | 1 | F | `[klucz wartość …]`. | EN-help, niezweryfikowane |
| ustalListęWłaściwości | setPlist | 2 | P | Zastępuje całą listę właściwości. | EN-help, niezweryfikowane |
| wszystkieWłaściwości | props | 0 | F | Nazwy list właściwości. | EN-help, niezweryfikowane |

---

## 6. Sterowanie

| nazwa kanoniczna | skróty/aliasy | wejścia | zwraca? | opis | źródło/pewność |
|---|---|---|---|---|---|
| powtórz | repeat | 2 | P | `powtórz n [lista]`. Pętle można zagnieżdżać. n < 1 nie wykonuje nic. **Ułamek jest zaokrąglany** (`powtórz 3.5` daje 4). Źródło PL to tylko wycinek z wyszukiwarki; EN-help mówi o obcinaniu, ale wygrywa PL. | PL |
| numpow | npw, repcount, repc | 0 | F | Numer bieżącego powtórzenia, licząc od 1, w najbliższej obejmującej pętli `powtórz`, `dla`, `dopóki` lub `dlaKażdego`. | PL |
| jeśli | if | 2 (3) | P/F | `jeśli warunek [lista]`. Gdy po drugiej danej stoi **literał listy** `[...]`, staje się trzecią daną („w przeciwnym razie”). Jest funkcją, gdy wykonana lista zwraca wartość. | PL |
| jeżeli | ifElse | 3 | P/F | `jeżeli warunek [lista1] [lista2]`. Jest funkcją, gdy gałęzie są wyrażeniami: `wynik jeżeli :n < 2 [1] [:n * silnia :n - 1]`. | PL |
| test | — | 1 | P | Zapamiętuje wynik warunku w bieżącej procedurze. | PL |
| jeśliTak | ifTrue, ift | 1 | P | Wykonuje listę, jeśli ostatni `test` dał `prawda`. | PL |
| jeśliNie | ifFalse, iff | 1 | P | Wykonuje listę, jeśli ostatni `test` dał `fałsz`. | PL |
| wybierz | case | 2 | P/F | `wybierz wartość [sel1 [lista] sel2 sel3 [lista] … [inaczej]]`. Kilka selektorów może prowadzić do jednej gałęzi. Ostatnia lista bez selektora to gałąź domyślna. Selektor porównujemy przez `=`. | PL |
| dopóki | while | 2 | P | `dopóki [warunek] [lista]`. Warunek jest sprawdzany przed każdym obrotem. | PL |
| czekajAż | waitUntil | 1 | P | Czeka, aż `[warunek]` będzie prawdą. Sprawdza go co cykl planisty. | EN-help, niezweryfikowane |
| dla | for | 3 | P | `dla "x [od do krok?] [lista]`. Koniec jest włączony. Bez kroku przy od > do liczy w dół. Krok 0 lub od = do: jeden obrót. `dla "x [1 5 3]` daje 1, 4. | PL |
| dlaKażdego | forEach | 3 | P | `dlaKażdego "s słowoLubLista [lista]`. Przebiega znaki słowa albo elementy listy; `npw` daje numer. | PL |
| pętla | loop | 1 | P | Nieskończona pętla **w bieżącym procesie**; ≡ `dopóki ["prawda] [..]`. | PL |
| uruchom | run | 1 | P/F | Wykonuje listę instrukcji albo wylicza `[wyrażenie]`. | EN-help, niezweryfikowane |
| czekaj | wait | 1 | P | Wstrzymuje **bieżący proces** na n milisekund. | PL |
| wynik | wy, output, op | 1 | P | Kończy funkcję użytkownika z wartością. Działa też z wnętrza pętli. | PL |
| stop | — | 0 | P | Kończy bieżącą procedurę. Poza procedurą kończy cały bieżący proces. | PL |
| złap | catch | 2 | P/F | `złap "znacznik [lista]`. Znacznik `"błąd` (ang. `"error`) łapie błędy. | EN-help, niezweryfikowane |
| rzuć | throw | 1 (2) | P | Przerywa wykonanie do pasującego `złap`. | EN-help, niezweryfikowane |
| zgłośBłąd | throwError, makeError | 1 (2) | P | Błąd użytkownika o numerze 100 z podanym tekstem. | EN-help, niezweryfikowane |
| błąd | error | 0 | F | Ostatni złapany błąd: `[numer komunikat procedura wiersz pierwotna wartość]`. | EN-help, niezweryfikowane |
| zignoruj | ignore | 1 | P | Pomija wartość. | EN-help, niezweryfikowane |
| poziomGłówny | topLevel | 0 | P | Przerywa wszystko i wraca do wiersza poleceń. | EN-help, niezweryfikowane |
| zakończ | bye | 0 | P | W przeglądarce działa jak `zatrzymajWszystko`. | EN-help, niezweryfikowane |

F12 zatrzymuje wszystkie procesy (PL). W naszym IDE robi to klawisz F12 i przycisk „Zatrzymaj”.

---

## 7. Procedury

| nazwa kanoniczna | skróty/aliasy | wejścia | zwraca? | opis | źródło/pewność |
|---|---|---|---|---|---|
| oto | to | (specjalne) | P | `oto nazwa :a :b` … `już`. Forma składniowa obsługiwana przez parser. | PL |
| już | end | (specjalne) | — | Kończy definicję. Poza definicją to błąd. | PL |
| definiuj | define | 2 | P | `definiuj "nazwa [[:a :b] [wiersz1] [wiersz2]]`. W plikach `.imp` występuje też forma `definiuj'Nazwa \|oto …¶…¶już\|`: dana będąca słowem z tekstem źródłowym. | PL (.imp), EN-help |
| tekst | text | 1 | F | Lista definicji procedury, czyli parametry i wiersze, bez `już`. | EN-help, niezweryfikowane |
| redaguj | red, edit, ed | 0..1 | P | Otwiera edytor procedur na danej procedurze. | PL |
| zdefiniowana? | defined? | 1 | F | Czy istnieje procedura użytkownika. | EN-help, niezweryfikowane |
| pierwotna? | primitive? | 1 | F | Czy słowo jest procedurą pierwotną. | EN-help, niezweryfikowane |
| procedury | procs | 0 | F | Nazwy procedur użytkownika (globalnych albo `self`). | EN-help, niezweryfikowane |
| zastosuj | apply | 2 | P/F | Wywołuje procedurę (nazwę albo `[[:a] wyrażenie]`) z listą danych. | EN-help, niezweryfikowane |
| zwykle | usual | 0..∞ | P/F | Wewnątrz metody obiektu wywołuje **odziedziczoną** wersję tej samej procedury. | EN-help, niezweryfikowane |

---

## 8. Arytmetyka i matematyka

| nazwa kanoniczna | skróty/aliasy | wejścia | zwraca? | opis | źródło/pewność |
|---|---|---|---|---|---|
| suma | sum | 2 (0..∞) | F | `+` w formie przedrostkowej. | EN-help, niezweryfikowane |
| różnica | difference | 2 | F | `-` w formie przedrostkowej. | EN-help, niezweryfikowane |
| iloczyn | product | 2 (0..∞) | F | `*` w formie przedrostkowej. | EN-help, niezweryfikowane |
| iloraz | quotient | 2 | F | `/`. Dzielenie przez 0 to błąd. | EN-help, niezweryfikowane |
| ilorazc | div | 2 | F | Dzielenie całkowite. **Najpierw obcina części ułamkowe danych**: `ilorazc 11 4` daje 2. | PL |
| reszta | mod | 2 | F | Reszta z dzielenia; znak jak u pierwszej danej. `reszta 11 3` daje 2. Działa też na wektorach. | PL |
| abs | — | 1 | F | Wartość bezwzględna. | PL |
| int | — | 1 | F | Obcina: `int -99.9` daje -99. | PL |
| zaokrąglij | round | 1 | F | Zaokrągla do najbliższej całkowitej. | EN-help, niezweryfikowane |
| pwk | sqrt | 1 | F | Pierwiastek kwadratowy: `pwk 2` daje 1.41421. | PL |
| potęga | power | 2 | F | aᵇ. Tego nie ma w Logomocji. | rozszerzenie |
| exp | — | 1 | F | eˣ. | EN-help, niezweryfikowane |
| ln | — | 1 | F | Logarytm naturalny. | EN-help, niezweryfikowane |
| log | log10 | 1 | F | Logarytm dziesiętny. | rozszerzenie |
| sin | — | 1 | F | Argument w stopniach. | EN-help, niezweryfikowane |
| cos | — | 1 | F | Argument w stopniach. | EN-help, niezweryfikowane |
| tg | tan | 1 | F | Argument w stopniach. | EN-help, niezweryfikowane |
| arctg | arctan | 1 | F | Wynik w stopniach. | EN-help, niezweryfikowane |
| pi | — | 0 | F | 3.14159… | rozszerzenie |
| losowa | random | 1 | F | Losowa liczba całkowita od 0 do n−1; ułamek n jest zaokrąglany, n < 0 to błąd. Dla listy losuje każdy element: `losowa [256 256 256]`. | PL, EN-help |
| losujOdNowa | randomize | 0..1 | P | Ustala ziarno generatora (z danej albo z zegara). | EN-help, niezweryfikowane |
| jld | any | 0 | F | Wartość „jak los da”. Interpretuje ją procedura, która ją dostaje (§1.6). Użyta jako liczba wprost, daje losową liczbę 0–99. | PL |
| obróć | rotate | 2 | F | Obraca wektor `[x y]` o kąt. | EN-help, niezweryfikowane |
| kątWektorów | vectorAngle | 2 | F | Kąt między wektorami. | EN-help, niezweryfikowane |
| bitI | bitAnd | 2 | F | Bitowe AND. | EN-help, niezweryfikowane |
| bitLub | bitOr | 2 | F | Bitowe OR. | EN-help, niezweryfikowane |
| bitAlbo | bitXor | 2 | F | Bitowe XOR. | EN-help, niezweryfikowane |
| bitNie | bitNot | 1 | F | Bitowe NOT. | EN-help, niezweryfikowane |
| równe? | equal? | 2 (2..∞) | F | Jak `=`. | EN-help, niezweryfikowane |
| większe? | greater? | 2 | F | Jak `>`. | EN-help, niezweryfikowane |
| mniejsze? | less? | 2 | F | Jak `<`. | EN-help, niezweryfikowane |
| maks | max | 2 (1..∞) | F | Największa liczba; przyjmuje też jedną listę liczb. | rozszerzenie |
| min | — | 2 (1..∞) | F | Najmniejsza liczba. | rozszerzenie |

---

## 9. Logika

Ogólne zasady:
- Wartości logiczne to słowa `prawda` i `fałsz` (PL). Szczegóły w §17.
- `i`, `lub` i `albo` **nie skracają obliczeń**: „Warunki logiczne w Logo są zawsze wyliczane do końca” (PL).
- Wyjątek: dana podana jako lista `[wyrażenie]` jest wyliczana leniwie (EN-help).

| nazwa kanoniczna | skróty/aliasy | wejścia | zwraca? | opis | źródło/pewność |
|---|---|---|---|---|---|
| i | and | 2 (0..∞) | F | Koniunkcja. `pokaż (i 2>1 5>4 7>0)` daje `prawda`. | PL |
| lub | or | 2 (0..∞) | F | Alternatywa. | PL |
| nie | not | 1 | F | Negacja. | PL |
| albo | xor | 2 (0..∞) | F | Alternatywa wykluczająca. | EN-help, niezweryfikowane |
| prawda | true | 0 | F | Zwraca słowo `prawda`. Słowo `"prawda` też działa. | PL |
| fałsz | false | 0 | F | Zwraca słowo `fałsz`. | PL |

---

## 10. Słowa i listy

| nazwa kanoniczna | skróty/aliasy | wejścia | zwraca? | opis | źródło/pewność |
|---|---|---|---|---|---|
| pierw | first | 1 | F | Pierwszy znak albo element. | PL |
| ost | ostw, last | 1 | F | Ostatni znak albo element. | PL |
| bezPierw | bp, butFirst, bf | 1 | F | Bez pierwszego. | PL |
| bezOst | bo, butLast, bl | 1 | F | Bez ostatniego. | PL |
| element | item | 2 | F | `element 4 "kotek` daje `e`. Indeks może być listą `[od do]` (fragment). | PL, EN-help |
| bezElNum | ben, butItem | 2 | F | Bez elementu o numerze n. | PL |
| bezElementu | be, butMember | 2 | F | `be x y` usuwa wszystkie wystąpienia x z y. | PL |
| zastąp | replace | 3 | F | `zastąp n lista x` daje kopię z n-tym elementem zamienionym na x. | PL |
| elementGłęboki | deepItem | 2 | F | `elementGłęboki [2 1] lista`. | EN-help, niezweryfikowane |
| zastąpGłęboko | deepReplace | 3 | F | Zamiana elementu wskazanego ścieżką. | EN-help, niezweryfikowane |
| los | pick | 1 | F | Losowy znak albo element. | PL |
| długość | count | 1 | F | Liczba znaków albo elementów: `długość [[a b] [98 87]]` daje 2. | PL |
| element? | member? | 2 | F | Czy należy. Dla słów sprawdza podsłowo: `element? "a "trasa` daje `prawda`. | PL |
| numel | member | 2 | F | Pozycja: `numel "dc "abcdedcba` daje 6; 0, gdy brak. Alias ang. `member` jest niepewny. | PL, niezweryfikowane (alias) |
| odElementu | fromMember | 2 | F | Fragment od pierwszego wystąpienia. | EN-help, niezweryfikowane |
| puste? | empty? | 1 | F | Czy `"` albo `[]`. | PL |
| liczba? | number? | 1 | F | Czy dana jest liczbą. | PL |
| lista? | list? | 1 | F | Czy dana jest listą. | PL |
| słowo? | word? | 1 | F | Czy dana jest słowem. | PL |
| lista | list | 2 (0..∞) | F | `lista [x y] "d` daje `[[x y] d]`. | PL |
| zdanie | zd, sentence, se | 2 (0..∞) | F | `zdanie [x y] "d` daje `[x y d]`. | PL |
| słowo | word | 2 (0..∞) | F | Skleja słowa. | PL |
| nap | fPut | 2 | F | Dodaje na początek. | PL |
| nak | lPut | 2 | F | Dodaje na koniec. Dla słów: `nak "kot "łos` daje `łoskot`. | PL |
| wspak | reverse | 1 | F | Odwraca słowo albo listę. | PL |
| tasuj | shuffle | 1 | F | Losowa permutacja. | PL |
| sortuj | sort | 1 | F | Liczby przed słowami; słowa według polskiego alfabetu (`localeCompare('pl')`). Źródło mówi, że „polskie litery na końcu”; przyjmujemy kolejność alfabetu polskiego. | PL |
| generuj | generate | 3 | F | `generuj n [wyrażenie] start`: lista n elementów; `:%` to poprzedni element. `generuj 3 [:%+1] 100` daje `[100 101 102]`. | PL (użycie), wnioskowane |
| mapuj | map | 2 | F | Stosuje `[wyrażenie z :%]` albo nazwę procedury do każdego elementu. | EN-help, niezweryfikowane |
| filtruj | filter | 2 | F | `filtruj [:% > 5] [1 … 8]` daje `[6 7 8]`. | EN-help |
| ascii | — | 1 | F | Kod pierwszego znaku: `ascii "a` daje 97. Dla polskich liter zwraca kod w Windows-1250. | PL |
| znak | char | 1 | F | `znak 65` daje `A`. Kody 128–255 według Windows-1250. | PL |
| wielkie | uppercase | 1 | F | Zamienia na wielkie litery. | rozszerzenie |
| małe | lowercase | 1 | F | Zamienia na małe litery. | rozszerzenie |

---

## 11. Wejście/wyjście

Znak zachęty pola tekstowego to `? `. W trakcie definiowania procedury jest to `> `.

| nazwa kanoniczna | skróty/aliasy | wejścia | zwraca? | opis | źródło/pewność |
|---|---|---|---|---|---|
| pisz | ps, print, pr | 1 (0..∞) | P | Wypisuje bez zewnętrznych nawiasów listy i przechodzi do nowego wiersza. `(pisz a b)` rozdziela dane spacjami. `pisz [bardzo [złożona [lista]]]` daje `bardzo [złożona [lista]]`. | PL |
| wpisz | type | 1 (0..∞) | P | Jak `pisz`, ale bez nowego wiersza. | PL |
| pokaż | show, sh | 1 (0..∞) | P | Wypisuje z nawiasami listy. **Nie mylić z `pokażMnie`.** | PL |
| piszWiersz | printLine, pl | 1 (0..∞) | P | Wypisuje dane w jednym wierszu, bez nawiasów. | EN-help, niezweryfikowane |
| czytajListę | cl, readList, rl | 0 | F | Pokazuje znak zachęty `CL: ` i zwraca wpisany wiersz jako listę. | PL |
| czytajSłowo | csw, readWord, rw | 0 | F | Zwraca wpisany wiersz jako słowo, albo liczbę, jeśli tekst jest liczbą. | PL |
| czytajZnak | cz, readChar, rc | 0 | F | Czeka na naciśnięcie klawisza i zwraca znak. Uwaga: jedno źródło używa `niech "bok cz` jak odczytu liczby; nasza implementacja zwraca znak. | PL |
| czytajKlawisz | readKey | 0 | F | Czeka na klawisz i zwraca jego nazwę lub kod. | EN-help, niezweryfikowane |
| klawisz? | key? | 0 | F | Czy w buforze czeka klawisz. | EN-help, niezweryfikowane |
| klawisz | key | 0 | F | Pobiera znak z bufora bez czekania; `"`, gdy bufor jest pusty. | EN-help, niezweryfikowane |
| ostatniKlawisz | lastKey | 0 | F | Ostatnio naciśnięty klawisz. | EN-help, niezweryfikowane |
| stanMyszy | mouseState | 0 | F | Stan przycisków myszy. | EN-help, niezweryfikowane |
| oknoDialogowe | dialogBox | 1..3 | F | `(oknoDialogowe tekst tytuł n)`: modal z przyciskami; zwraca numer przycisku. | EN-help, niezweryfikowane |
| komunikat | message | 1 | P | Okienko z tekstem i przyciskiem OK. | EN-help, niezweryfikowane |
| zapytaj | question, ask? | 1 | F | Okienko z polem tekstowym; zwraca wpisany tekst. | rozszerzenie |
| powiedz | say | 1 | P | Synteza mowy (`speechSynthesis`, `pl-PL`). | EN-help, niezweryfikowane |
| data | date | 0 | F | `[dzień miesiąc rok]`. | EN-help, niezweryfikowane |
| czas | time | 0 | F | `[godz min sek]`. | EN-help, niezweryfikowane |
| zegar | timer | 0 | F | Milisekundy od ostatniego `zerujZegar` (lub od startu). | EN-help, niezweryfikowane |
| zerujZegar | resetTimer, resetT | 0 | P | Zeruje `zegar`. | EN-help, niezweryfikowane |
| nuta | note | 2 | P | Wysokość (kod MIDI) i czas w ms (Web Audio). | EN-help, niezweryfikowane |
| pauza | rest | 1 | P | Cisza przez n ms. | EN-help, niezweryfikowane |
| graj | play | 1 | P | Odtwarza listę muzyczną. | EN-help, niezweryfikowane |
| grajPlik | playFile | 1 | P | Odtwarza plik dźwiękowy (URL). | EN-help, niezweryfikowane |
| ładujTekst | loadText | 1 | F | Wczytuje tekst pliku (w przeglądarce: wybór pliku albo localStorage). | EN-help, niezweryfikowane |
| zapiszTekst | saveText | 2 | P | Zapisuje tekst do pliku (pobranie albo localStorage). | EN-help, niezweryfikowane |
| ładujProjekt | loadProject, load | 1 | P | Wczytuje projekt `.lgm` lub `.imp`; z `.imp` importuje linie `definiuj'…`. | EN-help, niezweryfikowane |
| zapiszProjekt | save | 0..1 | P | Zapisuje projekt jako `.lgm`. | EN-help, niezweryfikowane |
| piszDo | printTo | 1 | P | Przekierowuje `pisz` do pliku, schowka albo pola (`[]` przywraca normalne wyjście). | EN-help, niezweryfikowane |
| pokażDokument | showDocument, showDoc, browseDocument, browseDoc | 1 | P | Otwiera URL w nowej karcie. | EN-help, niezweryfikowane |

---

## 12. Obiekty i klasy

Model obiektowy:
- Klasy pierwotne: `Główne` (Main), `OknoGłówne` (MainWindow), `Strona` (Page), `Plansza` (Pane), `Żółw` (Turtle),
  `PoleTekstowe` (TextBox), `Suwak` (Slider), `Przycisk` (Button).
  - Nazwy PL `Żółw` i `Strona` są potwierdzone (`.imp`). `Przycisk`, `Suwak` i `PoleTekstowe` pochodzą z interfejsu (PL). `Plansza` pochodzi z lekcji (PL). Reszta jest niezweryfikowana.
- **Klasy pierwotnych nie można modyfikować**, ale można tworzyć ich podklasy i jednostki. Nowe jednostki można też tworzyć z istniejącej jednostki (prototyp).
- Słownictwo: „klasa” to class, „jednostka” to instance.
- Dziedziczenie jest wielokrotne i dynamiczne: łańcuch klas plus **zachowania** (behaviours) (EN-help, popis.html).
- Każdy obiekt może mieć **własne procedury, zmienne i zdarzenia** (PL).
- **Ustawienia** (`poz`, `kierunek`, `pisak`, `postać`, `kolpis`, `grubość`, `wzórpis`, `widoczny`, `nazwa`, …) są zmiennymi obiektu.
  - W listach ustawień `nowy` i `nowaKlasa` podaje się pary `nazwa wartość`; wartości są wyliczane, np. `(pozmyszy)` albo `jld`.
  - Zmienna użytkownika w tej samej liście (np. `Promień 20`) tworzy zmienną własną.
  - Klucze ang. (`pos`, `heading`, `pen`, `shape`, `pc`, `pw`, `name`, `shown`, `rangeStyle`) też działają. **W kluczach listy ustawień `pw` znaczy grubość (penWidth)**, a nie `prawo`.
- Domyślne nazwy obiektów:
  - strony `s1`, `s2`, …
  - żółwie `ż1`, `ż2`, … (z prefiksu klasy; ang. `t1` jako alias nie jest tworzony)
  - plansze `p1`, …
  - przyciski `prz1`, …
  - suwaki `suw1`, …
  - pola tekstowe `pt1`, …

### 12.1 Wiele żółwi

Dwie listy są przechowywane dla każdego procesu:
- `wszystkie`: wszystkie żółwie na stronie;
- `kto`: żółwie aktywne w bieżącym procesie.

Polecenie żółwia wykonują równolegle wszystkie żółwie z `kto`. Funkcja zwraca wartość pierwszego z nich (PL).

| nazwa kanoniczna | skróty/aliasy | wejścia | zwraca? | opis | źródło/pewność |
|---|---|---|---|---|---|
| słuchaj | tell, setWho | 1 | P | Ustala aktywne żółwie: nazwę, listę nazw albo `wszystkie`. | PL |
| kto | who | 0 | F | Aktywne żółwie bieżącego procesu. **Słowo, gdy jest jeden; lista, gdy więcej.** | PL |
| proszę | ask | 2 | P/F | `proszę żółwie [lista]`: podane żółwie wykonują listę **równolegle**; na ten czas stają się aktywne. Działa też dla dowolnego obiektu: `proszę "s3'ż3 [np 50]`. | PL |
| proszęKażdego | askEach | 2 | P | Jak `proszę`, ale żółwie wykonują listę **po kolei**. | EN-help, niezweryfikowane |
| każdy | each | 1 | P | Aktywne żółwie po kolei wykonują listę. W środku `kto` to nazwa bieżącego żółwia. | PL |
| wszystkie | all, allTurtles | 0 | F | Żółwie strony (bez plansz zagnieżdżonych): `pokaż s1'wszystkie` daje `[ż1]`. | PL |
| wszystkieZ | allOf | 1 | F | Wszystkie jednostki danej klasy. | PL |
| ktoNaStronie | pageWho | 0 | F | `kto` z punktu widzenia strony. | EN-help, niezweryfikowane |

### 12.2 Tworzenie i usuwanie obiektów

| nazwa kanoniczna | skróty/aliasy | wejścia | zwraca? | opis | źródło/pewność |
|---|---|---|---|---|---|
| nowy | new | 2 | P/F | `nowy "Żółw [ustawienia]`. Rodzicem może być klasa albo jednostka (prototyp): `nowy "ż1 [pisak pod]`. Nazwa klasy bez rozróżniania wielkości liter. Zwraca nazwę nowego obiektu, ale wynik można pominąć. | PL |
| nowyObiekt | newObject | 1..∞ | P/F | `(nowyObiekt "Żółw "ustawienie wartość …)`. Działa jak `nowy`. | PL |
| nowaKlasa | newClass | 3 | P | `nowaKlasa "Żółw "Ptaszek [postać ptak.LGF kierunek 90 pisak pod]`. | PL |
| klonuj | clone | 1 (2) | P/F | Kopia obiektu z jego zmiennymi i procedurami (z opcjonalną listą ustawień). | EN-help, niezweryfikowane |
| usuńObiekt | eraseObject | 1 | P | Nazwa albo lista nazw: `usuńObiekt wszystkie`, `usuńObiekt wszystkieZ "ptaszek`. | PL |
| usuńCałkowicie | eraseComplete | 1 | P | Usuwa klasę razem ze wszystkimi jej jednostkami. | EN-help, niezweryfikowane |
| zniszcz | destroy | 0 | P | Obiekt usuwa sam siebie. | EN-help, niezweryfikowane |

### 12.3 Introspekcja i zachowania

| nazwa kanoniczna | skróty/aliasy | wejścia | zwraca? | opis | źródło/pewność |
|---|---|---|---|---|---|
| mojaNazwa | myName | 0 | F | Nazwa obiektu, który wykonuje kod. | PL |
| mojaStrona | myPage | 0 | F | Strona obiektu. | EN-help, niezweryfikowane |
| mójRodzic | myParent | 0 | F | Klasa lub prototyp obiektu. | EN-help, niezweryfikowane |
| mojeMiejsce | myPlace | 0 | F | Strona albo plansza, na której żyje obiekt. | EN-help, niezweryfikowane |
| ostatniObiekt | lastObject, lastName | 0 | F | Nazwa ostatnio utworzonego obiektu. | EN-help, niezweryfikowane |
| adresat | receiver | 0 | F | Bieżący adresat procesu (domyślnie okno główne). | EN-help, niezweryfikowane |
| klasa? | class? | 1 | F | Czy słowo jest nazwą klasy. | EN-help, niezweryfikowane |
| jest? | is?, e? | 1 (2) | F | Czy `self` (lub obiekt) pochodzi od danej klasy. | EN-help, niezweryfikowane |
| obiekt? | object? | 1 | F | Czy słowo jest nazwą obiektu. | EN-help, niezweryfikowane |
| obiekty | objects | 0 | F | Nazwy wszystkich obiektów. | EN-help, niezweryfikowane |
| nazwy | names | 0 | F | Zmienne obiektu `self` (lub globalne). | EN-help, niezweryfikowane |
| zmienne | variables | 0 | F | Zmienne własne obiektu. | EN-help, niezweryfikowane |
| potomkowie | descendants | 1 | F | Podklasy i jednostki obiektu. | EN-help, niezweryfikowane |
| dodajZachowanie | addBehaviour, addBehavior | 1 | P | Dołącza obiekt jako dodatkowego „rodzica” (zachowanie). | EN-help, niezweryfikowane |
| usuńZachowanie | removeBehaviour, removeBehavior | 1 | P | Odłącza zachowanie. | EN-help, niezweryfikowane |
| mojeZachowania | myBehaviours, myBehaviors | 0 | F | Lista zachowań. | EN-help, niezweryfikowane |
| ustalStan | setState | 1 | P | Ustawia wiele ustawień naraz z listy par. | EN-help, niezweryfikowane |
| zamroźMnie | freezeMe | 0 | P | Obiekt przestaje reagować na zdarzenia. | EN-help, niezweryfikowane |
| odmroźMnie | unFreezeMe | 0 | P | Przywraca reagowanie na zdarzenia. | EN-help, niezweryfikowane |
| zamrożony? | isFrozen? | 0 | F | Czy obiekt jest zamrożony. | EN-help, niezweryfikowane |

---

## 13. Zdarzenia i procesy równoległe

### 13.1 Proces

„Proces to niezależny wątek obliczeń, skończony lub nie, który ma własne aktywne obiekty, adresata, lokalne zmienne itd.” (PL)

Procedury obsługi zdarzeń uruchamiają się jako osobne procesy równoległe (EN popis.html).

| nazwa kanoniczna | skróty/aliasy | wejścia | zwraca? | opis | źródło/pewność |
|---|---|---|---|---|---|
| bezKońca | forever | 1 (2) | P | **Uruchamia nowy, niezależny proces**, który bez końca wykonuje listę. Opcjonalna druga dana to nazwa procesu. Różni się od `pętla`, która działa w bieżącym procesie. | PL, EN-help |
| co | every | 2 (3) | P | `co N [lista]`: nowy proces typu „bezKońca”, który wykonuje listę co N **milisekund**. | PL |
| równolegle | launch | 1 (2) | P | Uruchamia listę jako nowy proces równoległy. | EN-help, niezweryfikowane |
| poCzasie | after | 2 (3) | P | Jednorazowy timer: po N ms wykonuje listę w nowym procesie. | EN-help, niezweryfikowane |
| anuluj | cancel | 1 | P | Zatrzymuje proces o podanej nazwie albo liście. | EN-help, niezweryfikowane |
| skończony? | done? | 1 | F | Czy proces się zakończył. | EN-help, niezweryfikowane |
| wszystkieProcesy | allProcesses | 0 | F | Nazwy żywych procesów. | EN-help, niezweryfikowane |
| zatrzymajMnie | stopMe | 0 | P | Kończy bieżący proces. | EN-help, niezweryfikowane |
| zatrzymajWszystko | stopAll | 0 | P | Zatrzymuje wszystkie procesy; odpowiada F12 albo przyciskowi „Zatrzymaj”. | EN-help, niezweryfikowane |
| wstrzymajWszystko | pauseAll | 0 | P | Wstrzymuje wszystkie procesy. | EN-help, niezweryfikowane |
| wznówWszystko | resumeAll | 0 | P | Wznawia wstrzymane procesy. | EN-help, niezweryfikowane |

### 13.2 Zdarzenia: procedury

Zdarzenia to listy instrukcji przechowywane w obiekcie (strona, żółw, klasa, przycisk, suwak) i uruchamiane jako
osobne procesy. `self` to obiekt, który dostał zdarzenie. W Logomocji ustawia się je w oknie dialogowym
„Zmień …”, a w kodzie przez listę ustawień (`nowaKlasa "Żółw "Motyl [gdyKlik [usuńObiekt mojaNazwa]]`)
albo przez `ustalZdarzenie`.

| nazwa kanoniczna | skróty/aliasy | wejścia | zwraca? | opis | źródło/pewność |
|---|---|---|---|---|---|
| ustalZdarzenie | setEvent | 2 | P | `ustalZdarzenie "gdyKlik [lista]` ustawia zdarzenie obiektu `self`. Z apostrofem: `ż1'ustalZdarzenie …`. | EN-help, niezweryfikowane |
| zdarzenie | event | 1 | F | Lista instrukcji zdarzenia. | EN-help, niezweryfikowane |
| usuńZdarzenie | eraseEvent | 1 | P | Usuwa zdarzenie. | EN-help, niezweryfikowane |
| uruchomZdarzenie | runEvent | 1 | P | Uruchamia zdarzenie programowo. | EN-help, niezweryfikowane |
| zdarzenie? | event? | 1 | F | Czy zdarzenie jest zdefiniowane (z dziedziczeniem). | EN-help, niezweryfikowane |
| zdarzenia | events | 0 | F | Nazwy zdarzeń obiektu. | EN-help, niezweryfikowane |

### 13.3 Nazwy zdarzeń

Zdarzenia nie są procedurami; są kluczami w `LogoObject.events`. Na nazwy zdarzeń jest prefiks **`gdy…`**.
Przedrostek `przy…` nie pojawił się w żadnym źródle. Nazwy angielskie są aliasami.

| zdarzenie (PL) | alias ang. | obiekt | kiedy | pewność |
|---|---|---|---|---|
| gdyKlik | onClick | strona, żółw, obiekt | kliknięcie lewym przyciskiem | PL |
| gdyDwuklik | onDoubleClick | jw. | podwójne kliknięcie | niezweryfikowane |
| gdyLewyWciśnięty | onLeftDown | jw. | lewy przycisk w dół | PL (wycinek) |
| gdyLewyPuszczony | onLeftUp | jw. | lewy przycisk w górę | niezweryfikowane |
| gdyPrawyWciśnięty | onRightDown | jw. | prawy przycisk w dół | PL |
| gdyPrawyPuszczony | onRightUp | jw. | prawy przycisk w górę | niezweryfikowane |
| gdyRuchMyszy | onMouseMove | jw. | ruch myszy nad obiektem | niezweryfikowane |
| gdyMyszWchodzi | onMouseEnter | jw. | wejście kursora | niezweryfikowane |
| gdyMyszWychodzi | onMouseLeave | jw. | wyjście kursora | niezweryfikowane |
| gdyCiągnięty | onDrag | żółw | przeciąganie | niezweryfikowane |
| gdyZderzenie | onCollide | żółw (wymaga ustawienia `czuły prawda` / `sensitive true`) | kolizja postaci | niezweryfikowane |
| gdyUtworzony | onCreate | jednostka | po utworzeniu | niezweryfikowane |
| gdyWczytany | onLoad | projekt, strona | po wczytaniu | niezweryfikowane |
| gdyCzyść | onClean | strona | po `czyść` | niezweryfikowane |
| gdyPokazanaStrona | onShowPage | strona | strona pokazana | niezweryfikowane |
| gdyWciśnięty | onPush | przycisk | naciśnięcie przycisku | PL |
| gdyPuszczony | onRelease | przycisk | puszczenie przycisku | niezweryfikowane |
| gdyZmieniasz | onChange | suwak | w trakcie zmiany wartości | PL |
| gdyPoZmianie | onChanged | suwak, pole tekstowe | po zmianie wartości | PL |
| gdyKlawisz | onKeyDown | okno główne | naciśnięcie klawisza (`ostatniKlawisz` daje klawisz) | rozszerzenie |

---

## 14. Elementy interfejsu (przyciski, suwaki, pola tekstowe)

Elementy tworzy się przyciskami na pasku narzędzi („Nowy przycisk”, „Nowy suwak”, „Nowe pole tekstowe”)
albo w kodzie: `nowy "Przycisk [...]`, `nowy "Suwak [...]`, `nowy "PoleTekstowe [...]`.

**Ustawienia wspólne**: `poz`, `rozmiar` (`[szer wys]`), `widoczny`, `kolTła`.

**Ustawienia przycisku**:
- `napis` (ang. `caption`),
- zdarzenie `gdyWciśnięty`.

**Ustawienia suwaka**:
- `min`, `maks` (ang. `min`, `max`),
- `wartość` (ang. `value`),
- `pionowy` (ang. `vertical`, orientacja),
- zdarzenia `gdyZmieniasz` i `gdyPoZmianie`.

**Nazwa suwaka użyta jako słowo zwraca jego wartość**: `pt1'ustalZawartość suw1`, `np suw1` (PL).

**Pole tekstowe**: `zawartość` i `ustalZawartość` (PL).

| nazwa kanoniczna | skróty/aliasy | wejścia | zwraca? | opis | źródło/pewność |
|---|---|---|---|---|---|
| ustalZawartość | setContents, setValue | 1 | P | Pole tekstowe: ustala tekst. `\13\10` i `¶` łamią wiersz. Suwak: ustala wartość. Wywołuje się na obiekcie: `pt1'ustalZawartość …`. | PL |
| zawartość | contents, value | 0 | F | Pole tekstowe: tekst. Suwak: wartość. | PL |
| ustalNapis | setCaption | 1 | P | Napis na przycisku. | niezweryfikowane |
| napis | caption | 0 | F | Napis na przycisku. | niezweryfikowane |
| ustalMin | setMin | 1 | P | Minimum suwaka. | niezweryfikowane |
| ustalMaks | setMax | 1 | P | Maksimum suwaka. | niezweryfikowane |
| piszDoPola | printToTextBox | 2 | P | Dopisuje tekst do pola tekstowego. | EN-help, niezweryfikowane |
| ustalPrzyciski | setButtons | 1 | P | Definiuje przyciski okna przycisków. | EN-help, niezweryfikowane |
| pokażPrzyciski | showButtons | 0 | P | Pokazuje okno przycisków. | EN-help, niezweryfikowane |
| schowajPrzyciski | hideButtons | 0 | P | Chowa okno przycisków. | EN-help, niezweryfikowane |

---

## 15. Komunikaty błędów

### 15.1 Teksty potwierdzone (dokładnie tak, PL)

```
? pisz Ala
  Nie wiem jak wykonać Ala
 Sprawdź pisownię. Może to nowe nieokreślone słowo
? pisz "Jan "Kowalski
Jan
  Nie wiem co zrobić z Kowalski
 Nie powiedziałeś co zrobić z wynikiem
```

Wariant z przedrostkiem: `Błąd: Nie wiem jak wykonać pw40.` (PL, szkolazs).

**Nasza implementacja**:
- `LogoError.message` = pierwsza linia: `Nie wiem jak wykonać Ala`.
- Druga linia (podpowiedź) to `hint`, wypisywany przez IO w kolejnym wierszu.

### 15.2 Teksty niezweryfikowane

Wzorowane na szablonach Imagine z EN-help: „X doesn't like Y as input” i „Objects are incompatible”.

| sytuacja | komunikat | podpowiedź (2. wiersz) |
|---|---|---|
| nieznana procedura | `Nie wiem jak wykonać X` | `Sprawdź pisownię. Może to nowe nieokreślone słowo` (PL) |
| wartość bez przeznaczenia | `Nie wiem co zrobić z X` | `Nie powiedziałeś co zrobić z wynikiem` (PL) |
| zły typ danej | `X nie lubi Y jako danej` | — |
| za mało danych | `Za mało danych dla X` | — |
| funkcja nie zwróciła wartości | `X nie dał wyniku dla Y` | — |
| brak zmiennej | `X nie ma wartości` | — |
| dzielenie przez 0 | `Nie można dzielić przez zero` | — |
| `wynik` poza funkcją | `wynik może wystąpić tylko wewnątrz funkcji` | — |
| `stop` poza procedurą w niedozwolonym miejscu | `stop może wystąpić tylko wewnątrz procedury` | — |
| redefinicja pierwotnej | `X jest procedurą pierwotną` | — |
| brak obiektu | `Nie ma obiektu X` | — |
| niezgodne obiekty w `słuchaj` | `słuchaj nie lubi [ż1 p1] jako danej` | `Obiekty są niezgodne` |
| niedomknięty nawias | `Brakuje ]` / `Brakuje )` | — |
| nadmiarowy nawias | `Nieoczekiwany ]` / `Nieoczekiwany )` | — |
| `już` bez `oto` | `już bez oto` | — |
| za głęboka rekurencja | `Za mało pamięci (za głęboka rekurencja) w X` | — |
| przerwanie przez użytkownika | `Zatrzymano!` | — |
| błąd użytkownika (`zgłośBłąd`) | podany tekst, numer 100 | — |

Gdy błąd wystąpił w procedurze, dopisujemy `w procedurze X` (wiersz n). Ta forma jest niezweryfikowana.

---

## 16. Słowa o specjalnym znaczeniu (nie procedury)

| słowo | znaczenie |
|---|---|
| `prawda`, `fałsz` | wartości logiczne |
| `jld` | wartość losowa |
| `sklej`, `okno`, `płot`, `odbij` | style zakresu |
| `opu`, `pod`, `ścier`, `odwr` | stany pisaka |
| `"błąd` | znacznik dla `złap` |
| `Żółw`, `Strona`, `Plansza`, `Przycisk`, `Suwak`, `PoleTekstowe` | klasy pierwotne |
| `starter` | procedura uruchamiana po wczytaniu projektu |

---

## 17. Decyzje implementacyjne

1. **Wartości logiczne.**
   - Na wyjściu zawsze słowa `prawda` / `fałsz`.
   - Na wejściu `toBool(v)` przyjmuje:
     - `prawda`/`true` jako prawdę, `fałsz`/`false` jako fałsz;
     - **liczbę**: ≤ 0 to fałsz, ≥ 1 to prawda, 0 < p < 1 to prawda z prawdopodobieństwem p (EN-help: `ifElse 0.5 [fd 1][bk 1]`);
     - `jld`/`any` jak 0.5.
   - Inna wartość daje błąd `X nie lubi Y jako danej`.
2. **Wielkość liter.** Wszystkie nazwy są bez rozróżniania wielkości liter, przez `normName` = `toLocaleLowerCase('pl')`. Dotyczy to procedur, pierwotnych, zmiennych, obiektów, klas, kolorów, ustawień, zdarzeń i słów stylu zakresu. Słowa `"Ala` i `"ala` są równe dla `=`.
3. **Domyślna strona.**
   - Nazwa `s1`, rozmiar **796 × 499** (PL `.imp`, LOGIA, EN-help), tło białe, początek w środku, +y w górę.
   - LOGIA 2019 wymagała 799 × 599 (nowsza wersja?). To nie jest domyślne.
4. **Domyślny żółw.** Nazwa **`ż1`** na stronie `s1`, jedyny aktywny. Stan początkowy:
   - poz `[0 0]`, kierunek 0, `stanPoczątkowy [[0 0] 0]`;
   - pisak `opu`, kolor czarny, grubość 1, wzór 0;
   - kolor malowania czarny, wzór malowania 0;
   - styl zakresu `sklej`, zakres `[]`;
   - widoczny, postać: zielony żółw.
5. **Kolejność rozwiązywania nazw** (zmieniona w ARCHITEKTURA.md). Dla słowa `foo` wykonywanego z `self`:
   1. procedura własna obiektu `self`;
   2. procedury łańcucha klas / prototypów obiektu `self` oraz jego zachowań;
   3. procedury globalne użytkownika (okno główne);
   4. procedury pierwotne;
   5. ustawienie lub zmienna `self` o tej nazwie (np. `kierunek`, `zawartość`) albo nazwa obiektu, który ma wartość (suwak);
   6. błąd `Nie wiem jak wykonać foo`.

   Uzasadnienie:
   - obiekt może mieć własne procedury (PL);
   - `zwykle`/`usual` wywołuje wersję odziedziczoną, więc nadpisywanie musi działać (EN-help).

   Zmienne `:x` rozwiązujemy w tej kolejności: łańcuch dynamiczny (lokalne i dane procedur), zmienne własne `self`, wspólne zmienne klasy, globalne. Kolejność nie jest potwierdzona żadnym źródłem pierwotnym, więc resolver ma być konfigurowalny.
6. **Liczby.**
   - Kropka dziesiętna jest kanoniczna.
   - **Przecinek dziesiętny** między cyframi (`0,6`) parser też przyjmuje jako liczbę, bo kod msus go używa. To niezweryfikowane.
   - Liczby całkowite wypisujemy bez `.0`.
   - Liczby niecałkowite wypisujemy z **6 cyframi znaczącymi** (`pwk 2` daje `1.41421`, PL). Jest to sprzeczne z „≤ 10 cyfr” w ARCHITEKTURA.md (`formatValue`); zgłoszone do decyzji.
7. **Minus.** `7-3` i `7 - 3` to odejmowanie. `7 -3` to dwie dane (§1.5).
8. **`jeśli`** przyjmuje opcjonalną trzecią daną (gałąź „inaczej”), gdy następny token jest literałem listy.
9. **Zaokrąglanie w `powtórz`**: `Math.round`. W `losowa` ułamek n też jest zaokrąglany.
10. **`koło`/`okrąg`/`kropka`** przyjmują **średnicę**.
11. **`ukp` ustawia też kolor malowania** (EN-help); `ukm` po `ukp` go nadpisuje.
12. **Prędkość.** Imagine nie ma prymitywu prędkości; ruchy są natychmiastowe. Suwak prędkości w IDE i animacja kroków to `rozszerzenie`. Przy prędkości maksymalnej zachowanie ma być identyczne z oryginałem.
13. **Potęgowanie `^`** i `potęga` to `rozszerzenie`.
14. **Nazwy z ARCHITEKTURA.md bez pokrycia w źródłach:**
    - `lokalna` zostaje jako alias (ang. `local`);
    - `druk` nie istnieje, używamy `pisz`/`wpisz`/`pokaż`;
    - `przyKliknięciu`/`przyNaciśnięciuKlawisza` zastępujemy `gdyKlik`/`gdyKlawisz`;
    - tryby zakresu to `sklej`/`okno`/`płot`/`odbij`, a nie `zawijaj`/`okno`/`płot`.
15. **Angielskie aliasy.** Każda angielska nazwa Imagine jest aliasem. Dozwolone są obie pisownie `Colour`/`Color`. **Wyjątki kolizyjne** (wygrywa nazwa polska):
    - `pw` (= `prawo`, a nie penWidth);
    - `name` (= `nazwij` z odwróconą kolejnością, a nie `przypisz`);
    - `let` (= `niech`, które przyjmuje też listę).
16. **Kodowanie znaków.** `ascii` i `znak` używają Windows-1250 dla kodów 128–255, jak polski Windows. Gdy znaku nie ma w tej stronie kodowej, zwracamy kod Unicode.
17. **Import `.imp`.** Z pliku projektu Logomocji 2.0 (nagłówek `LGF05 … polishTX`) czytamy linie `definiuj'Nazwa |…|`, zamieniając `¶` na nowy wiersz. Obiekty i binarny blok IMZ1 pomijamy.
