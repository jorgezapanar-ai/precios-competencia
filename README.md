# Precios de competencia · Vinos premium · Lima

Panel interno de Wine Concierge con los precios que cada tienda publica hoy en su web, la política de envío en Lima y un catálogo filtrable con exportación a CSV.

**URL:** https://jorgezapanar-ai.github.io/precios-competencia/

## Estructura

| Archivo | Qué es |
|---|---|
| `index.html` | Panel completo (HTML + CSS + JS, sin dependencias). Carga `data.json` al abrirse. |
| `data.json` | Salida del recolector: resumen, fuentes, tipo de cambio, políticas de envío y productos. |
| `scripts/actualizar.mjs` | Recolector diario. Node ≥ 20, sin dependencias externas. |
| `scripts/envios.json` | Políticas de envío transcritas manualmente con cita y URL. El script solo revalida disponibilidad/cambios. |
| `scripts/servir.mjs` | Servidor estático local para revisar el panel (`node scripts/servir.mjs`). |

## Actualizar los datos

```bash
node scripts/actualizar.mjs
git add data.json && git commit -m "Lectura diaria" && git push
```

El script consulta 7 fuentes (VTEX, Shopify, WooCommerce, PrestaShop y HTML), convierte USD→PEN con tipo de cambio vivo y, si una web falla, conserva su última lectura buena marcándola como error.

## Fuentes y cobertura

| Tienda | Rol | Plataforma | Segmento leído |
|---|---|---|---|
| Wine Concierge | propia | VTEX IO | Vinos y espumantes (excluye destilados) |
| Wine Not Store | competencia | Shopify | Catálogo de vino |
| Perufarma | competencia | WooCommerce | VINOS PREMIUM |
| Licorerías Unidas | competencia | Shopify | vino-de-lujo |
| La Viniteca | competencia | PrestaShop | premium |
| Panuts | competencia | WooCommerce | Alta Gama |
| Madero Market | competencia | sitio estático | Sin catálogo de precios publicado |

Los segmentos **no son categorías equivalentes entre sí**: cada tienda define el suyo.

## Reglas de uso (AGENTS.md)

- Dato observado, inferencia y cálculo propio están etiquetados en el panel y en el diálogo de metodología.
- No citar una cifra sin verificar la ficha de origen: precios y stock cambian sin aviso.
- Uso interno; requiere aprobación antes de compartirse fuera del equipo.
