---
name: foxy-layout-design
description: Use when designing, editing, validating, or explaining Foxy keyboard layout JSON files, profiles, named layouts, key overrides, gestures, or layout metadata.
disable-model-invocation: false
---

# Foxy Layout Design

Use this skill when working on Foxy keyboard layout JSON. The format is named-
layout JSON with reusable key definitions and optional layout profiles. For all
Foxy-owned JSON formats, consult `FOXY_JSON_CONFIGS.md` and the schemas under
`schemas/`.

## File Location

The bundled reference file is:

```text
app/src/main/assets/frontend/layouts/default.json
```

At runtime, Foxy reads the selected profile from:

```text
<external-files>/foxy/frontend/layouts/<profile>.json
```

Profile files must be regular `.json` files directly inside `frontend/layouts`.
Do not use nested paths or path separators in profile names.

## Profile Structure

New layout profiles require:

```json
"type": "foxy.keyboard-layout"
```

For backward compatibility, files without `type` are accepted when their
structure is valid and are normalized with the expected type. A present,
incorrect type is invalid.

A profile must contain a non-empty top-level `layouts` object. It may also
contain an optional string `author`, shown below the filename in the profile
selector:

```json
{
  "type": "foxy.keyboard-layout",
  "author": "Foxy community",
  "keys": {
    "example.a": { "ref": "rime.a" }
  },
  "layouts": {
    "default": {
      "sections": [{
        "type": "rows",
        "rows": [[{ "ref": "example.a" }]]
      }]
    }
  },
  "actions": {},
  "macros": {}
}
```

`keys` contains reusable key definitions. `layouts` contains named keyboard
arrangements. `actions` and `macros` are optional.

## Related Foxy JSON Files

The repository-level reference is `FOXY_JSON_CONFIGS.md`. JSON Schemas are
available at:

```text
schemas/foxy-keyboard-layout.schema.json
schemas/foxy-popup-profile.schema.json
schemas/foxy-definitions.schema.json
```

Shared `keys`, `actions`, and `macros` belong in the Foxy definitions file:

```text
<external-files>/foxy/frontend/definitions.json
```

Popup profiles are separate files:

```text
<external-files>/foxy/frontend/popups/<profile>.json
```

They use `type: "foxy.popup-profile"` and a top-level `schemas` object. Layout
files enable a long-press popup by setting `longPress.popupKey`. Popup
candidates support string shorthand,
actions, macros, and shared key references. Their state fallback is:

```text
schema[state] -> schemas.default[state] -> schema.normal -> default.normal
```

An explicit `null` clears a state. Popup profiles do not resolve layout-local
definitions; use the shared definitions file for behavior that both formats
must reference.

Before a profile is shown in the selector, Foxy validates its JSON and attempts
to parse every named layout. A malformed layout, unresolved key reference,
invalid section, overlapping grid cell, or invalid key structure excludes the
whole profile from the selector. Keep action objects well-formed too: the
parser can represent some malformed direct actions as empty/no-op action lists,
so successful profile parsing alone is not proof that an action does what was
intended.

## Named Layouts

Each named layout contains one or more `sections`. A section is either `rows` or
`grid`:

Named layouts may also define status-dependent variants. A layout variant only
selects another named layout with `layout`; it cannot contain inline `sections`:

```json
"variants": [{
  "when": { "rime": { "ascii_mode": true } },
  "layout": "default"
}]
```

The last matching variant wins. References resolve within the same profile;
missing targets and reference cycles are invalid. The referenced layout and
the source layout are not merged.

```json
{
  "layouts": {
    "default": {
      "sections": [
        {
          "type": "rows",
          "rows": [
            [
              { "ref": "rime.q" },
              { "ref": "rime.w" }
            ]
          ]
        }
      ]
    }
  }
}
```

The normal four-row keyboard uses five total height units. If row height is
omitted, each row receives `5 / number_of_rows`; four rows therefore receive
`1.25` units each. Keep total height units compatible between layouts that are
switched during typing.

Rows can be arrays or objects with these properties:

```text
width        centered fraction of available width
height       row height in layout units
totalWeight  total width for rows containing weight: "auto"
keys         keys in the row
```

For a grid, declare `columns`, `rows`, and optionally `rowHeights`. Grid keys
use `column`, `row`, `columnSpan`, and `rowSpan`; cells may not overlap or leave
the grid.

### Text Editor Layout

`text_editor` is a special named layout opened with an app action, not with
`switch_layout`. Its upper area is Foxy's fixed cursor touchpad: swipe to move
the cursor; long-press and then swipe to extend a Shift selection. The layout
defines only the bottom key row.

It must contain exactly one `rows` section with exactly one row. That row uses
normal `KeyView` behavior, including key icons, click/double-click, swipe,
long-press repeat, holds, modifiers, and popup keys. Its key order, labels,
actions, and weights are fully profile-configurable. If the layout is absent or
does not meet this shape, Foxy uses its built-in English fallback row.

Open it from a gesture with `"command": "text_editor"`. Use
`foxy.LayoutDefault` (the `ABC` key) or another `switch_layout` key in the row
to return to the normal keyboard:

```json
"text_editor": {
  "sections": [{
    "type": "rows",
    "rows": [[
      { "ref": "foxy.LayoutDefault" },
      { "ref": "foxy.SelectAll", "override": { "label": "All", "keyType": "FUNCTION" } },
      { "ref": "foxy.Cut", "override": { "keyType": "FUNCTION" } },
      { "ref": "foxy.Copy", "override": { "keyType": "FUNCTION" } },
      { "ref": "foxy.Paste", "override": { "keyType": "FUNCTION" } },
      { "ref": "qwerty.backspace", "weight": 1 }
    ]]
  }]
}
```

### Split Layouts

A named layout can include an optional `split` layout fragment. This is an
alternate arrangement of that named layout, not another entry under
`layouts`, and it is selected by Foxy's split-keyboard setting rather than by
`switch_layout`:

```json
{
  "layouts": {
    "default": {
      "sections": [{
        "type": "rows",
        "rows": [[{ "ref": "rime.q" }, { "ref": "rime.w" }]]
      }],
      "split": {
        "sections": [{
          "type": "rows",
          "rows": [[
            { "ref": "rime.q" },
            { "ref": "rime.w" },
            { "ref": "foxy.Spacer", "weight": 2 },
            { "ref": "rime.e" }
          ]]
        }]
      }
    }
  }
}
```

Write the split geometry explicitly. Foxy does not automatically split rows;
use `foxy.Spacer` or weights to reserve the center gap. The fragment supports
the same sections, rows, grids, references, gestures, and key appearance
properties as the containing layout and shares its top-level `keys`, `actions`,
and `macros`.

Resolution applies the named layout's schema/status variant first, then reads
that result's `split` when split mode is requested. Without a request, or when
`split` is absent, the regular `sections` are used. If a requested split
fragment fails to parse, runtime resolution falls back to the regular layout;
profile validation still rejects invalid split fragments. Split fragments do
not perform another named-layout variant lookup. Keep normal and split layouts
at compatible total height units.

## Keys

A key can use a built-in definition or a user-defined definition:

```json
{
  "keys": {
    "qwerty.q": {
      "ref": "rime.q",
      "swipe": {
        "up": { "ref": "rime.Q" },
        "down": { "ref": "rime.1" }
      }
    }
  }
}
```

Place a reusable key in a layout with `ref`:

```json
{ "ref": "qwerty.q" }
```

Every resolved key must have a click gesture. Prefer `rime.*` and `foxy.*`
references over inline Android `KeyCode` actions.

## Definition Examples

Use the smallest definition level that fits the need.

### Level 1: Inline Key

Use an inline key for a one-off action:

```json
{
  "label": "Esc",
  "keyType": "FUNCTION",
  "tap": { "ref": "rime.Escape" }
}
```

### Level 2: Reusable Key Definition

Put a key under top-level `keys` when it is used more than once or has several
gestures:

```json
{
  "keys": {
    "nav.backspace": {
      "ref": "rime.BackSpace",
      "keyType": "FUNCTION",
      "icon": "backspace",
      "swipe": {
        "up": { "ref": "rime.Escape" }
      }
    }
  },
  "layouts": {
    "default": {
      "sections": [{
        "type": "rows",
        "rows": [[{ "ref": "nav.backspace" }]]
      }]
    }
  }
}
```

### Level 3: Placement Override

Reuse the same definition while changing only one placement:

```json
{
  "ref": "nav.backspace",
  "override": {
    "label": "删除",
    "weight": 1.5
  }
}
```

### Level 4: Profile With Named Layouts

Use a profile when a complete keyboard configuration needs multiple named
layouts, such as `default` and `numpad`:

```json
{
  "type": "foxy.keyboard-layout",
  "author": "Example author",
  "keys": {
    "key.a": {
      "ref": "rime.a",
      "keyType": "LETTER"
    }
  },
  "layouts": {
    "default": {
      "sections": [{
        "type": "rows",
        "rows": [[{ "ref": "key.a" }]]
      ]]
    },
    "numpad": {
      "sections": [{
        "type": "grid",
        "columns": 1,
        "rows": 1,
        "keys": [{
          "column": 0,
          "row": 0,
          "ref": "rime.KP_1"
        }]
      }]
    }
  }
}
```

## Actions and Macros

Use top-level `actions` to name one reusable action. The action name can then
be used as a string in `tap`, `swipe`, or another gesture:

```json
{
  "actions": {
    "editor.select_all": {
      "type": "key",
      "key": "A",
      "meta": ["CTRL"]
    }
  },
  "keys": {
    "select": {
      "label": "全选",
      "tap": "editor.select_all"
    }
  }
}
```

For a sequence, define a macro under top-level `macros`. Each step can refer to
an action by using `{ "action": "..." }`, or can contain an action object:

```json
{
  "actions": {
    "key.select_to_line_start": {
      "type": "key",
      "key": "HOME",
      "meta": ["SHIFT"]
    },
    "key.backspace": { "type": "key", "key": "BACKSPACE" }
  },
  "macros": {
    "delete_to_line_start": [
      { "action": "key.select_to_line_start" },
      { "action": "key.backspace" }
    ]
  },
  "keys": {
    "delete_line_prefix": {
      "label": "删至行首",
      "tap": { "macro": "delete_to_line_start" }
    }
  }
}
```

This macro sends `Shift+Home`, selecting from the cursor to the beginning of
the line, then sends `Backspace` to delete the selected text. Macros execute
their steps in order, so modifier flags belong on the action that sends the
modified key. Nested macros are not expanded as macro steps; keep macro steps
to supported action objects. A macro is invoked with `macro`, not with an
action `type`.

Another useful sequence deletes the previous word. It first moves one word
left, selects one word to the right, and deletes the selection:

```json
{
  "actions": {
    "word.left": {
      "type": "key",
      "key": "LEFT",
      "meta": ["CTRL"]
    },
    "word.select_right": {
      "type": "key",
      "key": "RIGHT",
      "meta": ["CTRL", "SHIFT"]
    },
    "word.delete": { "type": "key", "key": "BACKSPACE" }
  },
  "macros": {
    "delete_previous_word": [
      { "action": "word.left" },
      { "action": "word.select_right" },
      { "action": "word.delete" }
    ]
  }
}
```

## Built-in Capability Summary

Foxy currently provides these built-in capabilities to layout authors:

- Standard Rime/X11 key names through `rime.*`, including letters, digits,
  punctuation, navigation, editing, function, modifier, and keypad keys.
- Foxy modifier and editor actions through `foxy.*`, including Shift, layout
  switching, select all, native undo/redo, cut, copy, paste, and keypad Enter.
- Direct actions for key input, modifiers, committed text, layout switching,
  and selected Foxy app commands.
- Key actions are delivered to Rime as complete press/release strokes. The
  release event preserves the modifier mask and adds librime's `kReleaseMask`
  (`1 << 30`, or `0x40000000`). Layout authors do not define a separate
  release action.
- Single tap, double tap, swipe, long press with optional repeat, and hold with
  separate start/end actions.
- Reusable action definitions, ordered macros, status-dependent variants, row
  layouts, grid layouts, key appearance overrides, and orientation-specific
  layout height overrides.

Do not assume that an arbitrary librime keysym or Android key code is available;
use only the names listed in this skill or validate the layout before sharing it.

## Built-in Foxy Keys

These definitions include Foxy behavior:

| Name | Default behavior |
| --- | --- |
| `foxy.Shift` | Controls keyboard Shift state; label `⇧`; includes built-in `modifier: "SHIFT"` behavior. |
| `foxy.LayoutNumpad` | Function key labeled `123`; switches directly to `numpad`. |
| `foxy.LayoutDefault` | Function key labeled `ABC`; switches to `default`. |
| `foxy.SelectAll` | Sends `Ctrl+A` to the host editor. |
| `foxy.Undo` | Calls the host editor's native undo action. |
| `foxy.Redo` | Calls the host editor's native redo action. |
| `foxy.Cut` | Sends `Ctrl+X` to the host editor. |
| `foxy.Copy` | Sends `Ctrl+C` to the host editor. |
| `foxy.Paste` | Sends `Ctrl+V` to the host editor. |
| `foxy.KP_Enter` | Sends keypad Enter and uses the Enter icon. |
| `foxy.Spacer` | Invisible layout placeholder that occupies space without handling input. |

Built-in behavior can be changed at the placement site with supported
overrides.

`foxy.Shift` is a semantic modifier key, not only a visual Shift key. Its
built-in `modifier` field makes the action router toggle or lock Shift instead
of dispatching the normal click action. If a variant changes it into an
ordinary key, clear the inherited modifier explicitly:

```json
{
  "ref": "rime.a",
  "label": "Custom A",
  "icon": null,
  "modifier": null
}
```

## Built-in Names

The following `rime.*` names are currently implemented. This is a supported
subset, not the complete librime keysym table.

All currently implemented Foxy `rime.*` definitions are backed by the public
symbolic `KeyCode` names below. Do not assume that every name in librime's full
keysym table is available: Unicode, dead-key, ISO, and platform-specific names
outside Foxy's Android action set are intentionally not exposed.

Printable letters and digits:

```text
rime.a ... rime.z
rime.A ... rime.Z
rime.0 ... rime.9
```

Shifted punctuation:

```text
rime.exclam       rime.at              rime.numbersign
rime.dollar       rime.percent         rime.asciicircum
rime.ampersand    rime.asterisk       rime.parenleft
rime.parenright   rime.quotedbl       rime.underscore
rime.plus         rime.less           rime.greater
rime.braceleft    rime.braceright     rime.bar
rime.asciitilde   rime.colon          rime.question
rime.ApostropheShift rime.Question
```

Punctuation, navigation, editing, function, modifier, and keypad names:

```text
rime.space rime.semicolon rime.comma rime.period rime.minus rime.equal
rime.grave rime.quoteleft rime.slash rime.apostrophe rime.quoteright
rime.backslash rime.bracketleft rime.bracketright
rime.BackSpace rime.Return rime.Tab rime.Escape rime.Linefeed
rime.Clear rime.Pause rime.Scroll_Lock rime.Sys_Req
rime.Home rime.End rime.Page_Up rime.Prior rime.Page_Down rime.Next
rime.Begin rime.Insert rime.Delete rime.Up rime.Down rime.Left rime.Right
rime.Select rime.Print rime.Execute rime.Undo rime.Redo rime.Menu
rime.Find rime.Cancel rime.Help rime.Break rime.Num_Lock
rime.F1 ... rime.F12
rime.Shift_L rime.Shift_R rime.Control_L rime.Control_R
rime.Alt_L rime.Alt_R rime.Meta_L rime.Meta_R rime.Caps_Lock
rime.KP_Enter rime.KP_Space rime.KP_Tab rime.KP_F1 ... rime.KP_F4
rime.KP_Home rime.KP_Left rime.KP_Up rime.KP_Right rime.KP_Down
rime.KP_Page_Up rime.KP_Prior rime.KP_Page_Down rime.KP_Next
rime.KP_End rime.KP_Begin rime.KP_Insert rime.KP_Delete
rime.KP_Divide rime.KP_Multiply rime.KP_Subtract rime.KP_Add
rime.KP_Separator rime.KP_Decimal rime.KP_Equal rime.KP_0 ... rime.KP_9
```

`rime.q` supplies the normal Q action, while `rime.Q` supplies shifted `Q`.
Digit names such as `rime.1` are unshifted digits. Prefer these names when
the desired action is already represented by a standard key.

For a gesture reference, the referenced key's normal click label is used as
the displayed swipe hint unless the gesture object supplies its own `label`.
Therefore `{ "ref": "rime.1" }` displays `1` in a down-swipe hint, while
`{ "ref": "rime.Q" }` displays `Q` in an up-swipe hint. A gesture-level
`popup` is inherited from the referenced gesture unless explicitly supplied.
A gesture-level `label` changes only the visible hint, not the input action:

```json
{
  "swipe": {
    "down": { "ref": "rime.1" },
    "up": { "ref": "rime.Q", "label": "Upper Q" }
  }
}
```

When a key or selected variant declares its own `label`, that outer label is the
display label and wins over the label of a referenced `tap`. A `label` written
directly inside the tap object wins over the outer label:

```json
{
  "ref": "rime.a",
  "label": "Custom A"
}
```

The key above displays `Custom A`; adding `"label": "Tap"` inside its tap
displays `Tap`. A nested `tap` replaces the click gesture only. Do not use it as
a substitute for a variant-level `ref` when changing a key such as `foxy.Shift`
into an ordinary key.

### Low-Level KeyCode Names

Inline actions can use the following implementation names, but they should be
used only when no suitable `rime.*` or `foxy.*` reference exists:

```text
A B C D E F G H I J K L M N O P Q R S T U V W X Y Z
DIGIT_0 DIGIT_1 DIGIT_2 DIGIT_3 DIGIT_4 DIGIT_5
DIGIT_6 DIGIT_7 DIGIT_8 DIGIT_9
SPACE COMMA PERIOD SLASH SEMICOLON APOSTROPHE GRAVE MINUS EQUAL
LEFT_BRACKET RIGHT_BRACKET BACKSLASH NUMBERSIGN ASTERISK PLUS AT
ENTER BACKSPACE TAB ESCAPE LINEFEED CLEAR PAUSE SCROLL_LOCK SYS_REQ
INSERT DELETE HOME END PAGE_UP PAGE_DOWN UP DOWN LEFT RIGHT BEGIN
SELECT PRINT EXECUTE UNDO REDO MENU FIND CANCEL HELP BREAK NUM_LOCK
SHIFT_LEFT SHIFT_RIGHT CONTROL_LEFT CONTROL_RIGHT ALT_LEFT ALT_RIGHT
META_LEFT META_RIGHT CAPS_LOCK EISU_TOGGLE KANA_LOCK
HIRAGANA_KATAKANA ZENKAKU_HANKAKU
KP_0 ... KP_9 KP_DIVIDE KP_MULTIPLY KP_SUBTRACT KP_ADD KP_DECIMAL
KP_SEPARATOR KP_EQUAL KP_ENTER KP_SPACE KP_TAB KP_F1 ... KP_F4
KP_HOME KP_LEFT KP_UP KP_RIGHT KP_DOWN KP_PAGE_UP KP_PAGE_DOWN
KP_END KP_BEGIN KP_INSERT KP_DELETE
```

For example, this is valid but less portable than `{ "ref": "rime.Escape" }`:

```json
{
  "label": "Esc",
  "tap": { "type": "key", "key": "ESCAPE" }
}
```

## Placement Overrides

A placement can patch a reusable definition without changing it globally:

```json
{
  "ref": "qwerty.a",
  "override": {
    "label": "日",
    "shiftedLabel": "A",
    "weight": 1.2
  }
}
```

The supported key fields are:

```text
label, shiftedLabel, weight, height, modifier, keyType, id,
 statusLabel, textSize, hintTextSize, icon, colors,
tap, doubleTap, swipe, longPress, hold
```

Fields may also be written directly beside `ref`:

```json
{ "ref": "qwerty.backspace", "weight": 1.5 }
```

Precedence is:

```text
base definition < placement.override fields < direct placement fields
```

This applies to built-in and user-defined references. `weight: "auto"` is
supported for rows with a valid `totalWeight`.

### Per-Key Colors

Keys may override theme colors with `colors`. Values use `#RRGGBB` or
`#AARRGGBB`, including transparent colors such as `#00000000`:

```json
{
  "ref": "qwerty.enter",
  "colors": {
    "text": "#FFFFFFFF",
    "background": "#4CAF50",
    "pressed": "#388E3C",
    "border": "#2E7D32",
    "shadow": "#40000000",
    "hint": "#FFFFFFFF",
    "states": {
      "modifierActive": { "text": "#FFFF00" },
      "modifierLocked": { "background": "#388E3C" },
      "pressed": { "background": "#2E7D32" }
    }
  }
}
```

Color roles are `text`, `background`, `pressed`, `border`, `shadow`, `hint`,
`hintTop`, `hintBottom`, `hintLeft`, and `hintRight`. The precedence is global
theme, `keyType`, key base color, then matching runtime state color. Supported
runtime states are `modifierActive`, `modifierLocked`, and `pressed`, with
priority `modifierActive < modifierLocked < pressed`. `ascii_mode` and
`composing` continue to use regular status variants. A placement can put
`colors` inside `override` to limit the change to that occurrence.

Pressed and locked keys hide the normal shadow by default. A state's explicit
`shadow` color opts that state into drawing a shadow, including an explicitly
transparent shadow such as `#00000000`.

`null` clears an inherited value instead of meaning "not specified".
`label: null` clears the label to an empty string. `longPress: null` and
`hold: null` remove those gestures, `swipe: null` removes all swipes, and a
direction set to `null` removes only that swipe direction. `weight`/`height`
reset to `1`. In a gesture reference, `label`/`hint` blank, `popup` becomes
`false`, and `action`/`actions` become empty. `tap: null` keeps the inherited
click gesture because every key must remain clickable; it is the only `null`
that does not clear.

## Gestures

Supported direct action types are:

```text
key
modifier
text / commit
switch_layout
app
```

Common gesture forms:

```json
{
  "label": "Tab",
  "tap": { "type": "key", "key": "TAB" }
}
```

```json
{
  "swipe": {
    "up": { "ref": "rime.Q" },
    "down": { "ref": "rime.1" }
  }
}
```

```json
{
  "longPress": {
    "repeat": true,
    "action": { "type": "key", "key": "BACKSPACE" }
  }
}
```

```json
{
  "hold": {
    "label": "Mic",
    "start": { "type": "app", "command": "voice_start" },
    "end": { "type": "app", "command": "voice_stop" }
  }
}
```

A key must not define both `hold` and `longPress`.

Every gesture supports an optional `popup` boolean, defaulting to `true`. Set
it independently on `tap`, `doubleTap`, each `swipe` direction, `longPress`, or
`hold` to suppress that gesture's press-preview popup without disabling its
action:

```json
{
  "ref": "qwerty.q",
  "tap": { "ref": "rime.q", "popup": false },
  "swipe": {
    "up": { "ref": "rime.Q", "popup": true },
    "down": { "ref": "rime.1", "popup": false }
  }
}
```

## Status Variants

Use `variants` in a key definition, placement, or placement `override` to
change a key based on live Rime status. Each matching entry patches the
object at its own level; if more than one entry matches, the last matching
entry wins:

```json
{
  "ref": "rime.comma",
  "variants": [
    {
      "when": { "rime": { "composing": true } },
      "label": "2",
      "tap": { "ref": "rime.2" }
    }
  ]
}
```

Supported `when.rime` boolean conditions are:

```text
composing
ascii_mode
disabled
```

Unknown condition names do not match. Variants can patch the same key fields
and gestures as a regular key definition. A placement variant is useful when
only one layout occurrence needs a status-dependent label or action:

A selected variant may provide a `ref` to replace the key's base definition.
The variant's own fields then override the referenced definition. If it also
contains a nested `tap`, that tap determines the final click gesture and its
label. Use a variant-level `ref` when a key changes role, such as turning a
Shift modifier key into an ordinary letter key while composing:

```json
{
  "ref": "foxy.Shift",
  "variants": [{
    "when": { "rime": { "composing": true } },
    "ref": "rime.a",
    "label": "变a",
    "icon": null,
    "modifier": null
  }]
}
```

Use a variant-level `ref` when the base behavior or modifier role must change.
A nested `tap` replaces the click gesture; the key or variant `label` takes
priority over the referenced tap's label unless the tap object supplies its own
label.

```json
{
  "ref": "qwerty.q",
  "override": {
    "label": "手",
    "shiftedLabel": "Q",
    "variants": [
      {
        "when": { "rime": { "ascii_mode": true } },
        "label": "q",
        "shiftedLabel": "Q"
      }
    ]
  }
}
```

The general precedence at every level is `referenced base < override < direct
fields`. A selected definition variant is folded into the referenced definition
before the placement's `override` and direct fields are applied, so an outer
placement value always wins over an inner variant. Keep variants on reusable
definitions when possible; use placement variants for local layout-specific
behavior.

## App Commands

The `app` action type supports these current commands:

```text
symbols / switch_symbols
numpad / switch_numpad
emoji
kaomoji
settings
schema_list
data_directory_list / data_dir_list
deploy / deploy_rime
clipboard
theme / theme_list
voice / voice_toggle
voice_engine / voice_engine_list
ime_picker
floating_keyboard / floating
one_handed / one_handed_keyboard
split / split_keyboard
split_adjust_start
keyboard_adjust_start
keyboard_adjust_end
candidate_previous
candidate_next
select_schema
select_switch_option
undo
redo
hide_keyboard
text_editor
collapse_toolbar
expand_toolbar
toggle_toolbar_container
toggle_switch
expand_switches
voice_start
voice_stop
commit_text
```

`data_directory_list` opens the Rime data-directory picker. The alias
`data_dir_list` is also accepted. Selecting an entry switches the active Rime
user directory, redeploys Rime, and refreshes the current input session.

Argument-bearing commands use the action's `argument` string:

```json
{ "type": "app", "command": "select_schema", "argument": "cangjie5" }
{ "type": "app", "command": "select_switch_option", "argument": "ascii_mode=on" }
```

`candidate_previous` and `candidate_next` page the current candidate list.
`split_adjust_start` opens the split-keyboard adjustment panel.

```json
{
  "label": "Data",
  "tap": { "type": "app", "command": "data_directory_list" }
}
```

`commit_text` reads its content from the action's optional `argument` field:

```json
{
  "type": "app",
  "command": "commit_text",
  "argument": "example"
}
```

For ordinary named keyboard layouts, use `switch_layout` with an explicit
`layout` value. `symbols`, `emoji`, and `kaomoji` open built-in symbol panels,
not named layouts from the current profile.

For printable keys, labels normally follow the active Shift state. A single
uppercase label such as `"label": "Q"` is fixed and remains uppercase in both
Shift states. This only changes the displayed label; the input action still
comes from `ref` or `tap`.

## Layout Height Override

Height can be overridden for one named layout only:

```json
{
  "layouts": {
    "luna_pinyin": {
      "override": {
        "keyboardHeightPercent": 0.32,
        "keyboardHeightPercentLandscape": 0.32
      },
      "sections": [{
        "type": "rows",
        "rows": [[{
          "label": "a",
          "tap": { "ref": "rime.a" }
        }]]
      }]
    }
  }
}
```

`keyboardHeightPercent` applies in portrait and
`keyboardHeightPercentLandscape` applies in landscape. A configured layout
value takes precedence over the global keyboard size setting. Layouts without
the corresponding override continue to use the global setting.

During keyboard height adjustment, dragging changes only the live preview. The
value is persisted only after the user completes the adjustment. If the active
layout has a height override, Foxy updates that layout's corresponding field;
otherwise it updates the global orientation-specific setting. Cancelling does
not persist the preview.

## Validation Checklist

- New profiles contain `"type": "foxy.keyboard-layout"`; files without a
  type are accepted only when their structure is valid and then normalized.
- The file is valid JSON and uses a direct `.json` filename.
- The top-level `layouts` object is present and non-empty.
- Every named layout parses successfully.
- Every `ref` resolves to a built-in or user-defined key.
- Every key has a click gesture after resolution.
- Gesture references inherit `popup` unless explicitly overridden; an explicit
  `null` sets it to `false`.
- Swipe conversion preserves the effective gesture `popup` value.
- No key defines both `hold` and `longPress`.
- A popup-enabled long press uses `popupKey`.
- Rows using `weight: "auto"` provide a valid `totalWeight`.
- Grid cells do not overlap or exceed the grid.
- Switchable layouts use compatible total height units.
- A `split` fragment, when present, parses independently and has valid
  sections and key references.
- Normal and split arrangements use compatible total height units.
- Run `./gradlew testDebugUnitTest` after changing parser behavior.

The full public format reference is in `DEFAULT_LAYOUT_V0.0.1.md`.

## Agent Generation Workflow

When generating a layout from a natural-language request, follow this order:

1. Decide whether the user wants a new profile file or a change to an existing
   profile. Preserve unrelated layouts, keys, actions, macros, and metadata.
2. Identify the named layouts the keyboard will request. Normally this means
   `default` for the alphabetic keyboard and `numpad` for numeric fields. Add
   other names only when the app has an action that switches to them.
3. Define reusable behavior under `keys`, `actions`, and `macros` before
   assembling the visual rows or grid.
4. Prefer a built-in `rime.*` or `foxy.*` reference. Use an inline action only
   for behavior that has no suitable built-in definition.
5. Give every placed key a click action, either directly or through its
   resolved reference. Add swipe, double-tap, long-press, or hold behavior
   only when requested.
6. Use placement `override` for a local change. Do not duplicate a reusable
   definition just to change one label, width, icon, or gesture.
7. Check row weights, row heights, grid coordinates, and total height units.
8. Validate the complete profile, not just the layout the user mentioned.
   One invalid named layout excludes the profile from the selector.
9. Keep the requested filename as a direct `.json` file in `frontend/layouts`
   and add a top-level `author` only when the user supplies one.

### Complete Starting Template

Use this as a safe starting point for a new profile. Replace the example keys
and rows rather than removing required structure accidentally:

```json
{
  "author": "Example author",
  "keys": {
    "main.a": {
      "ref": "rime.a",
      "keyType": "LETTER"
    },
    "main.backspace": {
      "ref": "rime.BackSpace",
      "keyType": "FUNCTION",
      "icon": "backspace",
      "longPress": {
        "repeat": true,
        "action": { "type": "key", "key": "BACKSPACE" }
      }
    }
  },
  "actions": {},
  "macros": {},
  "layouts": {
    "default": {
      "sections": [{
        "type": "rows",
        "rows": [
          [
            { "ref": "main.a" },
            { "ref": "main.backspace" }
          ]
        ]
      }]
    }
  }
}
```

The template is syntactically complete, but its one-row keyboard is only a
minimal example. A production phone keyboard should normally use four rows
whose total height is five units.

## Action Schema

Use one of these exact direct action shapes:

```json
{ "type": "key", "key": "BACKSPACE", "meta": ["CTRL"] }
```

```json
{ "type": "modifier", "modifier": "SHIFT", "state": "ONESHOT" }
```

```json
{ "type": "text", "text": "hello" }
```

```json
{ "type": "commit", "text": "hello" }
```

```json
{ "type": "switch_layout", "layout": "numpad" }
```

```json
{ "type": "app", "command": "settings" }
```

For a key action, `key` must be one of the listed low-level `KeyCode` names.
The `meta` value may be a string or an array containing `SHIFT`, `CTRL`,
`ALT`, or `META` (matching is case-insensitive). For modifier actions, the
modifier names are `SHIFT` or `CTRL`; supported states are `OFF`, `ONESHOT`,
`LOCKED`, and `TOGGLE_LOCKED`. `TOGGLE_LOCKED` changes `OFF` or `ONESHOT` to
`LOCKED`, and changes `LOCKED` back to `OFF`:

```json
{
  "tap": {
    "type": "modifier",
    "modifier": "SHIFT",
    "state": "TOGGLE_LOCKED"
  }
}
```

When a key has a `modifier` field, an explicit click action using
`TOGGLE_LOCKED` takes precedence over the built-in one-shot/locked click
behavior. This allows a second key to toggle the same modifier while following
its active and locked presentation:

```json
{
  "ref": "foxy.Shift",
  "label": "锁定",
  "tap": {
    "type": "modifier",
    "modifier": "SHIFT",
    "state": "TOGGLE_LOCKED"
  }
}
```

All keys registered for the same modifier receive the same state updates.

Prefer a public `rime.*` reference in user-authored layouts. For example, use
`{ "tap": { "ref": "rime.Shift_L" } }` to send a Rime `Shift_L` event. The
symbolic `KeyCode` name `SHIFT_LEFT` is also supported for a direct key action:
`{ "tap": { "type": "key", "key": "SHIFT_LEFT" } }`. Do not expose or write
Android integer keycodes in layout JSON; `SHIFT_LEFT` is a Foxy action name,
not an Android numeric keycode.

For example, a tap of `rime.BackSpace` reaches Rime as:

```text
0xff08, 0x00000000   # press
0xff08, 0x40000000   # release
```

With `Ctrl+A`, the Control bit is retained on release:

```text
0x0061, 0x00000004   # press
0x0061, 0x40000004   # release
```

The same rule applies to `rime.*` references, low-level key actions, macros,
and raw keysym actions. Do not add a second action to simulate key release.

In a gesture, use either `action` or `actions` for direct action data. A string
such as `"editor.copy"` is looked up in top-level `actions`. A macro invocation
uses `{ "macro": "name" }`, not `{ "type": "macro" }`.

## Macro Design Rules

Macros are ordered lists of supported action objects. Put modifier flags on the
individual key action that needs them. The parser also accepts an action
reference string as a macro step, but the explicit `{ "action": "name" }`
form is clearer and should be preferred:

```json
{
  "actions": {
    "select_line_start": {
      "type": "key",
      "key": "HOME",
      "meta": ["SHIFT"]
    },
    "delete_selection": {
      "type": "key",
      "key": "BACKSPACE"
    }
  },
  "macros": {
    "delete_to_line_start": [
      { "action": "select_line_start" },
      { "action": "delete_selection" }
    ]
  }
}
```

Do not rely on a modifier action remaining active across later macro steps.
Use the `meta` field on each modified key action. Do not nest a macro inside a
macro: nested macro actions are discarded when converting macro steps.

## Selection and Fallback Behavior

The profile selector scans only the external `frontend/layouts` directory.
Selecting a profile stores its filename and immediately rebuilds the active
keyboard. The app then requests named layouts such as `default` or `numpad`
from that profile.

When the requested layout is `default`, a layout named after the active Rime
schema takes precedence over `default`. Keep a usable `default` layout in every
profile. Explicit layout names such as `numpad` are selected by that name when
available; otherwise the normal built-in fallback may be used.

If no valid profile exists, the settings page reports the built-in default
layout. If a selected file is removed, selection falls back to `default.json`;
if that file is unavailable or cannot provide the requested layout, the app
falls back to its built-in Kotlin layout where one exists.

After the structural checks, validate action types, required fields,
references, and intended behavior separately. JSON syntax or schema validity
alone does not guarantee that every action will perform the intended operation.

Do not make a profile depend on a named layout that the app cannot request. A
profile can contain extra named layouts, but they are useful only when a
Foxy action or schema lookup selects their names.

## Final Agent Response

After generating or editing a profile, report:

- the profile filename;
- the named layouts added or changed;
- any built-in definitions and macros used;
- whether an `author` or height override was added;
- validation results and any layout that was intentionally omitted.

Do not claim a profile is valid based only on JSON syntax. It must also pass
the structural and reference checks described above.
