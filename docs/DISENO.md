# Sistema de diseño

Rediseño visual de 2026 orientado a conversión: misma funcionalidad, apariencia lujosa y confiable. Todo se
construye con clases utilitarias de Tailwind 4 sobre unos pocos tokens; no hay hojas de estilo por pantalla.
El rediseño no cambió la lógica, las rutas ni las llamadas a la API.

## Temas

Claro y oscuro comparten los nombres de los tokens. El interruptor de la tienda cambia el atributo
`data-theme` en `<html>` (se guarda en `localStorage` como `tienda-theme` y se aplica antes de la primera
pintura). La variante `dark:` está ligada a ese atributo y se usa solo para ajustes que no son de color.

## Tokens (`frontend/src/app/globals.css`)

- **Superficies:** `background` (neutro cálido), `surface` (tarjetas), `surface-2` (rellenos suaves), `border` y `border-strong`.
- **Texto:** `foreground` (tinta casi negra) y `muted-foreground`.
- **Acento coral (`accent`):** solo para comprar (agregar al carrito, continuar al pago, precios en oferta). Las demás acciones principales van en tinta (`foreground`). El degradado de marca queda solo en el logo y el titular.
- **Estados:** `exito`, `aviso` y `peligro`, con versión suave por opacidad (`bg-exito/10`). El color siempre acompaña un texto o un ícono.
- **Sombras:** `shadow-suave` (reposo), `shadow-elevada` (hover y paneles), `shadow-flotante` (lo que flota) y `shadow-acento` (botón de compra).
- **Movimiento:** `ease-resorte` (lo que se toca), `ease-salida` (lo que aparece) y las animaciones `animate-aparecer`, `animate-emerger`, `animate-salto` (contador del carrito) y `animate-brillo`. Con "reducir movimiento" todo queda instantáneo.
- **Tipografía:** Plus Jakarta Sans. Precios y cantidades con `tabular-nums`.

## Reglas

- **Radios:** controles `rounded-xl`, tarjetas `rounded-2xl`/`rounded-3xl`, bloques grandes `rounded-[2rem]`, pastillas `rounded-full`.
- **Vidrio esmerilado (`vidrio`)** solo en la cápsula de navegación, la barra de pestañas y las ofertas relámpago.
- **Una acción principal por bloque.** En celular, la acción de compra vive en una barra fija sobre las pestañas (ficha de producto y carrito); WhatsApp y los avisos suben por encima de ella con la regla `body:has([data-barra-compra]) [data-flotante]`.
- **Hover solo donde hay cursor:** lo que aparece al pasar el cursor (botón Agregar, indicadores de galería) queda siempre visible en pantallas táctiles (`[@media(hover:hover)]`).
- **Foco visible** en todo control y etiquetas visibles en todos los formularios.
- **Tailwind 4 usa `translate` y `scale` como propiedades propias:** las transiciones deben nombrarlas (`transition-[translate,...]`) y las animaciones que conviven con un hover usan esas propiedades, no `transform`.

## Componentes base (`frontend/src/components/ui`)

| Componente | Uso |
| --- | --- |
| `Button` / `buttonStyles()` | Variantes `primary` (comprar), `dark`, `secondary`, `ghost`, `danger`; tamaños `sm`, `md`, `lg`; `loading` muestra un indicador. `buttonStyles()` da las mismas clases a un `Link` |
| `Field`, `Input`, `Select`, `Textarea` | Campo con etiqueta, ayuda o error enlazados por id |
| `Badge` | Estados cortos con tono (`neutral`, `dark`, `accent`, `success`, `warning`, `danger`). Los tonos de pedidos y PQRS están en `lib/statusTones.ts` |
| `Skeleton` / `ProductCardSkeleton` | Marcadores de carga con la forma del contenido |
| `Container` | Ancho y márgenes de página (`narrow`, `medium`, `wide`) |
| `AuthCard` | Tarjeta de las pantallas de acceso |
| `cn` (`lib/cn.ts`) | Une clases y resuelve choques con tailwind-merge (conoce los tokens propios) |
| `magnetic` (`lib/magnetic.ts`) | Efecto magnético de los botones de compra; solo visual |

## Avance por secciones

Cada sección va en su propio commit y se revisó con capturas en celular, tableta y escritorio, en claro y oscuro:

1. Fundamentos: tokens, tipografía y componentes base.
2. Navegación tipo app: cápsula de vidrio, pestañas inferiores en celular, contador con salto y pie.
3. Catálogo en grilla bento: titular con búsqueda, categorías como en una app, ofertas de vidrio, tarjetas con segunda foto y botón magnético, marcadores de carga.
4. Ficha de producto: galería con lupa, caja de compra fija y barra de compra en celular.
5. Carrito y checkout: fotos, cantidad en cápsula, resumen fijo y paso a paso.
6. Cuenta, acceso, PQRS y páginas legales.
7. Paneles de administración y jurídico.
