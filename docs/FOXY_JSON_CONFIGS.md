# Foxy JSON Configuration Formats

Foxy-owned JSON files use a top-level `type` discriminator. The JSON Schemas
are in `schemas/`:

| Type | Schema | Runtime location |
| --- | --- | --- |
| `foxy.keyboard-layout` | `schemas/foxy-keyboard-layout.schema.json` | `frontend/layouts/*.json` |
| `foxy.popup-profile` | `schemas/foxy-popup-profile.schema.json` | `frontend/popups/*.json` |
| `foxy.definitions` | `schemas/foxy-definitions.schema.json` | `frontend/definitions.json` |

The type field is required for new files. For backward compatibility, a file
without a type is accepted when its structure is valid and is normalized with
the expected type. A present but incorrect type is rejected.

## Shared Definitions

`frontend/definitions.json` contains reusable `keys`, `actions`, and `macros`.
Layout and popup profiles merge their own definitions over the shared names.
Definitions are resolved by the common layout action/key parser.

```json
{
  "type": "foxy.definitions",
  "keys": {},
  "actions": {
    "editor.copy": { "type": "key", "key": "C", "meta": ["CTRL"] }
  },
  "macros": {
    "editor.copy_twice": [
      { "action": "editor.copy" },
      { "action": "editor.copy" }
    ]
  }
}
```

## Keyboard Layout

```json
{
  "type": "foxy.keyboard-layout",
  "author": "Example",
  "layouts": {
    "default": { "sections": [] }
  }
}
```

The complete layout reference is `DEFAULT_LAYOUT_V0.0.1.md`. A layout declares
the long-press popup capability by setting `longPress.popupKey`:

```json
{
  "ref": "rime.q",
  "longPress": { "popupKey": "q" }
}
```

If `popupKey` is absent, the existing long-press action or repeat behavior is
used. Layout-local definitions are not visible to popup profiles; put shared
definitions in `definitions.json` instead.

## Popup Profile

```json
{
  "type": "foxy.popup-profile",
  "author": "Example",
  "schemas": {
    "default": {
      "q": {
        "normal": ["q", "ɋ"],
        "shifted": ["Q", "Ɋ"]
      }
    },
    "luna_pinyin": {
      "q": {
        "normal": [
          { "label": "啊", "action": { "type": "commit", "text": "啊" } }
        ],
        "shifted": null
      }
    }
  }
}
```

Popup state resolution is per state:

```text
schema[state] -> schemas.default[state] -> schema.normal -> default.normal
```

An explicit `null` clears that state and disables the popup for it. Popup item
strings are converted to physical key actions when they are printable ASCII;
other strings are committed as text. Object items may use `action`, `actions`,
`macro`, or a shared key `ref`.

## AI Editing Rules

- Select the schema matching the file `type` before editing.
- Preserve unrelated top-level fields and named layouts/schema groups.
- Use `definitions.json` for behavior reused by both layouts and popups.
- Use `popupKey` to enable a popup on a layout key.
- Keep popup state names limited to `normal` and `shifted`.
- Use `null` only when a popup state must be explicitly disabled.
- Validate both JSON syntax and semantic references after editing.

The JSON Schema provides editor/AI structural guidance. Runtime validation also
resolves shared definitions, built-in key names, actions, macros, popup refs,
and layout geometry; passing JSON Schema alone is not a complete runtime
validation result.
