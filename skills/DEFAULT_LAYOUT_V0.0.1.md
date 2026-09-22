# Foxy Layout File v0.0.1

This document defines the JSON format used by Foxy keyboard layout files.
New files must use the top-level type discriminator `"foxy.keyboard-layout"`.
See `FOXY_JSON_CONFIGS.md` and `schemas/foxy-keyboard-layout.schema.json` for
the shared configuration and schema overview.
The bundled example is:

```text
app/src/main/assets/frontend/layouts/default.json
```

At runtime Foxy first reads the external file at:

```text
<external-files>/foxy/frontend/layouts/default.json
```

The external file takes precedence over the bundled fallback.

The external `frontend/layouts` directory can contain multiple layout profile
files. Each profile is a JSON file whose top-level `layouts` object contains
one or more named layouts. The active profile is selected in Keyboard settings
and is used for all named-layout lookups. If the selected file is missing, Foxy
falls back to `default.json`, then to the built-in layout when no external
profile is available.

Profiles may optionally provide an author string at the top level. Foxy shows
this value below the profile filename in the profile selector:

```json
{
  "type": "foxy.keyboard-layout",
  "author": "Foxy community",
  "layouts": {}
}
```

## Top-Level Structure

```json
{
  "type": "foxy.keyboard-layout",
  "author": "Foxy community",
  "keys": {},
  "layouts": {},
  "actions": {},
  "macros": {}
}
```

`author` is an optional string shown in the keyboard layout profile selector.
It does not affect layout parsing. `keys` contains reusable key and gesture
definitions. `layouts` contains the visual arrangement of those definitions.

The public v0.0.1 format is the named-layout format shown above. A valid
public file provides a non-empty `layouts` object; `keys`, `actions`, and
`macros` are optional when all keys and gestures are defined inline.
Each named layout contains `sections`, and each section is either `rows` or
`grid`.

## Key Definitions

A key can reference a built-in definition:

```json
{
  "keys": {
    "qwerty.space": {
      "ref": "rime.space",
      "textSize": 16,
      "tap": { "ref": "rime.space" }
    }
  }
}
```

Built-in names use these namespaces:

- `rime.*`: standard Rime/X11 key definitions, such as `rime.q`,
  `rime.space`, `rime.Escape`, `rime.KP_1`.
- `foxy.*`: Foxy actions and special keys, such as `foxy.SelectAll`,
  `foxy.LayoutNumpad`, and `foxy.KP_Enter`.
- User-defined names: arbitrary names declared under `keys`, commonly using
  names such as `qwerty.space.up` or `qwerty.comma.composing`.

The `ref` chain may point to another user-defined key or a built-in key. A
cycle is invalid and is ignored by the parser.

## Built-in Key Names

The following names are available to JSON files without declaring them under
`keys`.

### `rime.*` Names

The list below is Foxy's currently implemented subset of Rime/X11 names. It
does not represent the complete name table in librime's `key_table.cc`.
Unsupported librime names are not automatically available in layout JSON.
Every `rime.*` name currently registered by Foxy can be represented by the
public symbolic `KeyCode` names listed below. The complete librime table also
contains Unicode, dead-key, ISO, and other platform-specific names that are not
part of Foxy's Android keyboard action set.

Printable letters and digits:

```text
rime.a ... rime.z
rime.A ... rime.Z
rime.0 ... rime.9
```

The uppercase letter names produce the shifted letter action. The digit names
produce unshifted digits. The following punctuation names produce shifted
symbols:

| Name | Label |
| --- | --- |
| `rime.exclam` | `!` |
| `rime.at` | `@` |
| `rime.numbersign` | `#` |
| `rime.dollar` | `$` |
| `rime.percent` | `%` |
| `rime.asciicircum` | `^` |
| `rime.ampersand` | `&` |
| `rime.asterisk` | `*` |
| `rime.parenleft` | `(` |
| `rime.parenright` | `)` |
| `rime.quotedbl` | `"` |
| `rime.underscore` | `_` |
| `rime.plus` | `+` |
| `rime.less` | `<` |
| `rime.greater` | `>` |
| `rime.braceleft` | `{` |
| `rime.braceright` | `}` |
| `rime.bar` | `|` |
| `rime.asciitilde` | `~` |
| `rime.colon` | `:` |
| `rime.question` | `?` |
| `rime.ApostropheShift` | `"` |
| `rime.Question` | `?` |

Punctuation, editing, navigation, function, modifier, and keypad names:

```text
rime.space              rime.semicolon          rime.comma
rime.period             rime.minus              rime.equal
rime.grave              rime.quoteleft          rime.slash
rime.apostrophe         rime.quoteright         rime.backslash
rime.bracketleft        rime.bracketright       rime.BackSpace
rime.Return             rime.Tab                rime.Escape
rime.Clear              rime.Pause              rime.Scroll_Lock
rime.Sys_Req            rime.Home               rime.End
rime.Page_Up            rime.Prior              rime.Page_Down
rime.Next                rime.Begin              rime.Insert
rime.Delete             rime.Up                 rime.Down
rime.Left               rime.Right              rime.Select
rime.Print              rime.Execute             rime.Undo
rime.Redo               rime.Menu               rime.Find
rime.Cancel             rime.Help               rime.Break
rime.Num_Lock           rime.F1 ... rime.F12
rime.Shift_L            rime.Shift_R             rime.Control_L
rime.Control_R          rime.Alt_L               rime.Alt_R
rime.Meta_L             rime.Meta_R              rime.Caps_Lock
rime.KP_Enter           rime.KP_Space            rime.KP_Tab
rime.KP_F1 ... rime.KP_F4
rime.KP_Home             rime.KP_Left             rime.KP_Up
rime.KP_Right            rime.KP_Down             rime.KP_Page_Up
rime.KP_Prior            rime.KP_Page_Down        rime.KP_Next
rime.KP_End              rime.KP_Begin             rime.KP_Insert
rime.KP_Delete           rime.KP_Divide            rime.KP_Multiply
rime.KP_Subtract         rime.KP_Add               rime.KP_Separator
rime.KP_Decimal          rime.KP_Equal             rime.KP_0 ... rime.KP_9
```

### `foxy.*` Names

```text
foxy.Shift
foxy.LayoutNumpad
foxy.LayoutDefault
foxy.SelectAll
foxy.Undo
foxy.Redo
foxy.Cut
foxy.Copy
foxy.Paste
foxy.KP_Enter
foxy.Spacer
```

These names are built-in key definitions with Foxy-specific behavior. Their
current built-in contents are:

| Name | Default label | Type | Built-in behavior |
| --- | --- | --- | --- |
| `foxy.Shift` | `⇧` | modifier key | Controls the keyboard Shift state and carries the built-in `modifier: "SHIFT"` behavior. |
| `foxy.LayoutNumpad` | `123` | function key | Switches directly to the `numpad` layout. |
| `foxy.LayoutDefault` | `ABC` | function key | Switches to the `default` layout. |
| `foxy.SelectAll` | `Sel` | function key | Sends `Ctrl+A` to the host editor. |
| `foxy.Undo` | `Undo` | function key | Calls the host editor's native undo action. |
| `foxy.Redo` | `Redo` | function key | Calls the host editor's native redo action. |
| `foxy.Cut` | `Cut` | regular key | Sends `Ctrl+X` to the host editor. |
| `foxy.Copy` | `Copy` | regular key | Sends `Ctrl+C` to the host editor. |
| `foxy.Paste` | `Paste` | regular key | Sends `Ctrl+V` to the host editor. |
| `foxy.KP_Enter` | `Enter` | action key | Sends keypad Enter (`KP_ENTER`) and displays the Enter icon. |
| `foxy.Spacer` | empty | placeholder | Occupies layout space without drawing or handling input. |

The built-in definitions provide the behavior shown above, but a layout can
override their `label`, `weight`, `keyType`, `icon`, gestures, or other
supported key properties at the placement site. For example:

```json
{
  "ref": "foxy.SelectAll",
  "override": {
    "label": "全选",
    "weight": 1.2
  }
}
```

`foxy.LayoutNumpad` and `foxy.LayoutDefault` include their corresponding
`switch_layout` actions directly, so they can be used without a tap override.

`foxy.Undo` and `foxy.Redo` invoke the host editor's native undo and redo
commands. They are not Rime keysyms.

`foxy.Shift` is a semantic modifier key, not just a key with a Shift icon. Its
built-in `modifier` field causes the action router to toggle or lock Shift
instead of dispatching the normal click action. When a variant changes it into
an ordinary key, clear the inherited modifier explicitly:

```json
{
  "ref": "rime.a",
  "label": "变a",
  "icon": null,
  "modifier": null
}
```

`foxy.Spacer` is an invisible layout placeholder. Its `weight` and optional
`height` control the reserved space:

```json
{ "ref": "foxy.Spacer", "weight": 1.0 }
```

`rime.*` definitions provide base key actions and labels. Layout-specific
properties and gestures, including `weight`, `keyType`, `icon`, `hold`, and
`longPress`, belong in the layout JSON rather than in the Rime definition.

### Sending Rime Modifier Keys

Use the `rime.*` name when a layout should send a Rime/X11 key event. For
example, a key that sends a `Shift_L` press and release can be defined as:

```json
{
  "keys": {
    "send.shift_l": {
      "label": "Shift_L",
      "tap": { "ref": "rime.Shift_L" }
    }
  },
  "layouts": {
    "default": {
      "sections": [{
        "type": "rows",
        "rows": [[{ "ref": "send.shift_l" }]]
      }]
    }
  }
}
```

Public layouts should prefer `rime.*` references. Android `KeyCode` names and
numeric values must not be written as Android integer keycodes. The symbolic
`KeyCode` name `SHIFT_LEFT` remains supported when a direct key action is
needed:

```json
{ "tap": { "type": "key", "key": "SHIFT_LEFT" } }
```

This symbolic name is a Foxy layout action name, not an Android numeric
keycode.

Foxy sends every key action to Rime as a complete stroke. For `Shift_L`
(keysym `0xffe1`), the events are:

```text
keycode = 0xffe1, mask = 0x00000000   # press
keycode = 0xffe1, mask = 0x40000000   # release
```

`0x40000000` is librime's `kReleaseMask`. The release event keeps any active
modifier bits. Do not add a second JSON action just to simulate release.

`rime.Shift_L` is a Rime key event. It is different from `foxy.Shift`, which
changes Foxy's semantic Shift state and is normally used for the keyboard's
shift key.

## Defining and Calling Layout Keys

The bundled `default.json` uses a reusable `qwerty.*` layer on top of the
built-ins. A definition describes one physical key and its extra gestures:

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

Here `rime.q` supplies the normal tap action. The `up` and `down` entries
reference independent gesture definitions, so the key sends uppercase `Q`
on up-swipe and unshifted `1` on down-swipe.

For a gesture reference, Foxy uses the referenced key's normal click label as
the displayed swipe hint unless the gesture object provides its own `label`.
Thus `{ "ref": "rime.1" }` displays `1` on the down-swipe hint, and
`{ "ref": "rime.Q" }` displays `Q` on the up-swipe hint. A gesture-level
`label` changes only the visible hint, not the input action:

```json
{
  "swipe": {
    "down": { "ref": "rime.1" },
    "up": { "ref": "rime.Q", "label": "Upper Q" }
  }
}
```

When a key or selected variant declares its own `label`, that outer label is the
display label. A referenced tap supplies the action and a default label, so the
outer label wins over the referenced tap's label. A `label` written directly
inside the tap object wins over the outer label:

```json
{
  "label": "Outer",
  "tap": { "ref": "rime.Tab" }
}
```

The key above displays `Outer`. Writing `"tap": { "ref": "rime.Tab",
"label": "Tap" }` displays `Tap` instead. The same precedence applies to a
`label` supplied by a variant: it overrides the referenced tap's label.

A variant-level `ref` still replaces the key's base behavior and modifier role,
but a nested `tap` then determines the final click gesture; the outer or variant
label still wins unless the tap object supplies its own label.

A layout calls a reusable key with `ref`:

```json
{
  "layouts": {
    "default": {
      "sections": [{
        "type": "rows",
        "rows": [[
          { "ref": "qwerty.q" },
          { "ref": "qwerty.w" }
        ]]
      }]
    }
  }
}
```

The same definition can be called by multiple layouts. A placement can patch
it without changing the shared definition:

```json
{
  "ref": "qwerty.q",
  "override": {
    "label": "手",
    "shiftedLabel": "Q"
  }
}
```

The `cangjie5` layout in `default.json` uses this pattern: it reuses every
`qwerty.*` key and changes only the visible main label for the Cangjie key.
Its gesture actions remain those of the shared QWERTY definition unless a
gesture is explicitly patched.

## Built-in Key Codes

`KeyCode` names are implementation names accepted by the low-level JSON action
syntax. They are not required when using the built-in names above.

### Printable Keys

These keys have no fixed X11 keysym in `KeyCode`; the active keyboard symbol
table supplies their values:

```text
A B C D E F G H I J K L M N O P Q R S T U V W X Y Z
DIGIT_1 DIGIT_2 DIGIT_3 DIGIT_4 DIGIT_5
DIGIT_6 DIGIT_7 DIGIT_8 DIGIT_9 DIGIT_0
SPACE COMMA PERIOD SLASH SEMICOLON APOSTROPHE
GRAVE MINUS EQUAL LEFT_BRACKET RIGHT_BRACKET BACKSLASH
NUMBERSIGN ASTERISK PLUS AT
```

### Named Keys and X11 Keysyms

| `KeyCode` | Keysym | `KeyCode` | Keysym |
| --- | ---: | --- | ---: |
| `ENTER` | `0xff0d` | `BACKSPACE` | `0xff08` |
| `TAB` | `0xff09` | `ESCAPE` | `0xff1b` |
| `LINEFEED` | `0xff0a` | `CLEAR` | `0xff0b` |
| `PAUSE` | `0xff13` | `SCROLL_LOCK` | `0xff14` |
| `SYS_REQ` | `0xff15` | `INSERT` | `0xff63` |
| `DELETE` | `0xffff` | `HOME` | `0xff50` |
| `END` | `0xff57` | `PAGE_UP` | `0xff55` |
| `PAGE_DOWN` | `0xff56` | `UP` | `0xff52` |
| `DOWN` | `0xff54` | `LEFT` | `0xff51` |
| `RIGHT` | `0xff53` | `BEGIN` | `0xff58` |
| `SELECT` | `0xff60` | `PRINT` | `0xff61` |
| `EXECUTE` | `0xff62` | `UNDO` | `0xff65` |
| `REDO` | `0xff66` | `MENU` | `0xff67` |
| `FIND` | `0xff68` | `CANCEL` | `0xff69` |
| `HELP` | `0xff6a` | `BREAK` | `0xff6b` |
| `NUM_LOCK` | `0xff7f` | `SHIFT_LEFT` | `0xffe1` |
| `SHIFT_RIGHT` | `0xffe2` | `CONTROL_LEFT` | `0xffe3` |
| `CONTROL_RIGHT` | `0xffe4` | `ALT_LEFT` | `0xffe9` |
| `ALT_RIGHT` | `0xffea` | `META_LEFT` | `0xffe7` |
| `META_RIGHT` | `0xffe8` | `CAPS_LOCK` | `0xffe5` |
| `EISU_TOGGLE` | `0xff30` | `KANA_LOCK` | `0xff2d` |
| `HIRAGANA_KATAKANA` | `0xff27` | `ZENKAKU_HANKAKU` | `0xff2a` |

Keypad codes:

| `KeyCode` | Keysym | `KeyCode` | Keysym |
| --- | ---: | --- | ---: |
| `KP_0` ... `KP_9` | `0xffb0` ... `0xffb9` | `KP_DIVIDE` | `0xffaf` |
| `KP_MULTIPLY` | `0xffaa` | `KP_SUBTRACT` | `0xffad` |
| `KP_ADD` | `0xffab` | `KP_DECIMAL` | `0xffae` |
| `KP_SEPARATOR` | `0xffac` | `KP_EQUAL` | `0xffbd` |
| `KP_ENTER` | `0xff8d` | `KP_SPACE` | `0xff80` |
| `KP_TAB` | `0xff89` | `KP_F1` ... `KP_F4` | `0xff91` ... `0xff94` |
| `KP_HOME` | `0xff95` | `KP_LEFT` | `0xff96` |
| `KP_UP` | `0xff97` | `KP_RIGHT` | `0xff98` |
| `KP_DOWN` | `0xff99` | `KP_PAGE_UP` | `0xff9a` |
| `KP_PAGE_DOWN` | `0xff9b` | `KP_END` | `0xff9c` |
| `KP_BEGIN` | `0xff9d` | `KP_INSERT` | `0xff9e` |
| `KP_DELETE` | `0xff9f` |  |  |

The keysym values are the values sent to librime. Android `KeyEvent` values
are adapter details and are intentionally not part of the layout file format.

## Gestures

Each gesture may set `popup` to `false` to suppress its press-preview popup
without changing the gesture action. The default is `true`:

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

Popup visibility is independent for `tap`, `doubleTap`, each swipe direction,
`longPress`, and `hold`.

### Click

The `tap` property defines the click gesture. It can reference another key
definition:

```json
"tap": { "ref": "rime.space" }
```

Or define an action directly:

```json
"tap": {
  "type": "switch_layout",
  "layout": "numpad"
}
```

Supported direct action types are:

```text
key
modifier
text / commit
switch_layout
app
```

Modifier actions use `SHIFT` or `CTRL` as the modifier and support these
states:

| State | Behavior |
| --- | --- |
| `OFF` | Turns the modifier off. |
| `ONESHOT` | Activates the modifier for the next completed key gesture. |
| `LOCKED` | Keeps the modifier active until explicitly turned off. |
| `TOGGLE_LOCKED` | If the modifier is not locked, locks it; if it is locked, turns it off. |

For example, this tap toggles Shift between unlocked and locked:

```json
{
  "tap": {
    "type": "modifier",
    "modifier": "SHIFT",
    "state": "TOGGLE_LOCKED"
  }
}
```

`TOGGLE_LOCKED` is a command rather than a persistent modifier state. It treats
`OFF` and `ONESHOT` as unlocked, changes either to `LOCKED`, and changes
`LOCKED` to `OFF`.

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

`app` commands are the built-in application commands implemented by Foxy,
including `symbols`, `numpad`, `emoji`, `kaomoji`, `settings`, `schema_list`,
`data_directory_list`, `deploy`, `clipboard`, `theme`, `voice`,
`voice_engine`, `ime_picker`, `floating_keyboard`, `one_handed`,
`split_keyboard` / `split`, `undo`,
`redo`, `hide_keyboard`, `text_editor`, `collapse_toolbar`, `expand_toolbar`,
`toggle_toolbar_container`, `toggle_switch`, `expand_switches`, `voice_start`,
`voice_stop`, `split_adjust_start`, `candidate_previous`, `candidate_next`,
`select_schema`, `select_switch_option`, and `commit_text`.
The alias `data_dir_list` is also accepted. `data_directory_list` opens the
Rime data-directory picker; selecting a directory switches the active Rime
user directory and redeploys Rime.

Commands with arguments use the action's `argument` string:

```json
{ "type": "app", "command": "select_schema", "argument": "cangjie5" }
{ "type": "app", "command": "select_switch_option", "argument": "ascii_mode=on" }
```

`select_schema` selects the given Rime schema ID. `select_switch_option` selects
the named switch option using the `switchName=option` form. The candidate page
commands move the current candidate list backward or forward by one page.
`split_adjust_start` opens the split-keyboard adjustment panel.

```json
{
  "label": "Data",
  "tap": { "type": "app", "command": "data_directory_list" }
}
```

Reusable action definitions can be declared under `actions` and referenced by
string:

```json
{
  "actions": {
    "key.backspace": { "type": "key", "key": "BACKSPACE" }
  },
  "keys": {
    "backspace": { "label": "Backspace", "tap": "key.backspace" }
  }
}
```

The string is resolved from the top-level `actions` object. It is equivalent
to placing the referenced action object directly in `tap`, `swipe`, or another
gesture:

```json
"tap": "key.backspace"
```

Macros are declared under `macros` as arrays of action references or action
objects and are invoked with a `macro` property, not an action `type`:

```json
{
  "actions": {
    "key.backspace": { "type": "key", "key": "BACKSPACE" }
  },
  "macros": {
    "erase": [{ "action": "key.backspace" }]
  },
  "keys": {
    "erase": { "label": "Erase", "tap": { "macro": "erase" } }
  }
}
```

### Double Tap

`doubleTap` defines the action fired when a key is tapped twice within the
platform double-tap interval. A key with `doubleTap` delays confirmation of a
single tap so one double tap does not also fire the normal `tap` action. Keys
without `doubleTap` keep the immediate single-tap behavior.

It can reference another key definition:

```json
"doubleTap": { "ref": "rime.b" }
```

Or use an action directly:

```json
"doubleTap": {
  "action": { "type": "key", "key": "B" }
}
```

The `doubleTap` field already determines the gesture type, so `kind` is not
needed. It supports the same `ref`, `action`/`actions`, `macro`, `label`, and
`hint` forms as other single-action gestures.

### Swipe

`swipe` is an object whose keys are `up`, `down`, `left`, and `right`:

```json
{
  "qwerty.backspace.up": {
    "label": "Esc",
    "tap": { "ref": "rime.Escape" }
  },
  "qwerty.backspace": {
    "ref": "rime.BackSpace",
    "swipe": {
      "up": { "ref": "qwerty.backspace.up" }
    }
  }
}
```

The referenced definition's `tap` gesture becomes the swipe action. The
referenced `label` is used as the swipe hint.

### Hold and Long Press

A hold can provide separate start and end actions:

```json
"hold": {
  "label": "Mic",
  "start": { "type": "app", "command": "voice_start" },
  "end": { "type": "app", "command": "voice_stop" }
}
```

For example, the bundled default layout defines the spacebar's voice hold in
the layout file:

```json
"qwerty.space": {
  "ref": "rime.space",
  "hold": {
    "label": "🎤",
    "start": { "type": "app", "command": "voice_start" },
    "end": { "type": "app", "command": "voice_stop" }
  }
}
```

The same rule applies to layout-specific long-press behavior and appearance,
such as repeated Backspace deletion, Shift locking, key weights, key types,
and icons.

To enable the long-press popup profile for a key, set an explicit `popupKey`:

```json
"longPress": {
  "popupKey": "q"
}
```

The `popupKey` is both the capability switch and the lookup key in the selected
`frontend/popups/<profile>.json`. If it is absent, the regular long-press
action/repeat behavior is used. Popup profiles, shared definitions, state
fallback, and validation are documented in `FOXY_JSON_CONFIGS.md`.

For repeating keys, use `longPress`:

```json
"longPress": {
  "repeat": true,
  "action": { "type": "key", "key": "BACKSPACE" }
}
```

A key must not define both `hold` and `longPress`.

## Composing Variants

`variants` selects a key definition, placement, or placement `override` based
on Rime status. The current format supports `composing`, `ascii_mode`, and
`disabled` under `when.rime`:

```json
{
  "qwerty.comma.composing": { "ref": "rime.2" },
  "qwerty.comma": {
    "ref": "rime.comma",
    "variants": [
      {
        "when": { "rime": { "composing": true } },
        "label": "2",
        "tap": { "ref": "qwerty.comma.composing" }
      }
    ]
  }
}
```

When the status changes, Foxy updates the affected key views in place. The
whole keyboard is not rebuilt for a composing transition.

A placement can use a variant inside `override` when a status-dependent change
should apply only to that occurrence of a reusable key:

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

Variants are selected independently at the definition and placement levels.
The effective precedence is:

```text
selected definition variant < placement override variant/fields < direct placement variant/fields
```

The general rule at every level is `referenced base < override < direct fields`.
A definition's selected variant is folded into the referenced definition before
the placement's `override` and direct fields are applied, so an outer placement
value always wins over an inner variant.

This allows layouts such as Cangjie to show radicals in Chinese mode and
letters in ASCII mode without duplicating the base key definitions.

A selected variant may also provide a `ref`. In that case the referenced key
becomes the variant's new base definition, and the variant's own fields then
override its presentation and behavior. This is useful when a key changes
role, for example when a Shift key becomes an ordinary letter key while
composing:

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

Use a variant-level `ref` when the key's base behavior or modifier role must
change. A nested `tap` replaces the click gesture; the key or variant `label`
takes priority over the referenced tap's label unless the tap object supplies
its own label.

## Key Appearance

The following properties are supported on key definitions and overrides:

```json
{
  "label": "space",
  "shiftedLabel": "SPACE",
  "textSize": 16,
  "hintTextSize": 11,
  "keyType": "LETTER",
  "weight": 1.0,
  "height": 1.0,
  "icon": "backspace"
}
```

`keyType` values are `LETTER`, `FUNCTION`, and `ACTION`.

`statusLabel` can be a string or an object with a `source` field:

```json
"statusLabel": { "source": "schema_name" }
```

The currently supported icon names are:

```text
backspace
shift
enter
return
```

An unknown icon name renders without an icon. Resource names outside this list
are not part of the public layout format.

### Hint Text Size

A numeric `hintTextSize` applies to all four swipe directions:

```json
"hintTextSize": 11
```

An object applies sizes by direction. Unspecified directions retain the base
definition's value or fall back to the global hint size:

```json
"hintTextSize": {
  "up": 11,
  "down": 10,
  "left": 9,
  "right": 9
}
```

Direction names are case-insensitive. Values must be positive numbers.

`textSize` controls the main label. `hintTextSize` controls the swipe hints.
Both are in scaled pixels (`sp`). Labels are still proportionally scaled to
fit their available key area; a hint that becomes too small to read may be
hidden while its layout space remains reserved.

For printable keys, labels normally follow the active Shift state. An explicit
single uppercase letter such as `"label": "Q"` is treated as a fixed display
label and remains `Q` whether Shift is active or not. This changes presentation
only; the key's input action still comes from its referenced or inline action.

## Overrides

A layout placement can patch a reusable definition without duplicating it.
Patch fields may be written directly on the placement or inside `override`:
The following placement fragment is used as an item inside a row's `keys`
array:

```json
{
  "ref": "qwerty.a",
  "override": {
    "label": "日",
    "shiftedLabel": "A",
    "hintTextSize": { "up": 10 }
  }
}
```

Both forms are supported:

```json
{ "ref": "qwerty.a", "label": "日", "textSize": 18 }
```

```json
{ "ref": "qwerty.a", "override": { "label": "日", "textSize": 18 } }
```

When both are present, the precedence is:

```text
base definition < override fields < direct placement fields
```

Supported key patch fields include:

```text
label
shiftedLabel
weight
height
modifier
keyType
id
statusLabel
textSize
hintTextSize
icon
colors
tap
doubleTap
swipe
longPress
hold
```

These fields may be written directly on a placement or inside its `override`
object. They apply to both user-defined keys and built-in keys referenced by
`ref`. When both forms specify the same field, the direct placement field wins
over the placement's `override` object.

`colors` provides per-key ARGB color overrides. Supported values are `#RRGGBB`
and `#AARRGGBB`; alpha is preserved, so fully transparent colors such as
`#00000000` are valid. The supported color roles are `text`, `background`,
`pressed`, `border`, `shadow`, `hint`, `hintTop`, `hintBottom`, `hintLeft`, and
`hintRight`. A key color takes precedence over its `keyType` color and the
global theme color.

Runtime key states can override these roles through `colors.states`:

```json
{
  "ref": "qwerty.enter",
  "colors": {
    "background": "#4CAF50",
    "pressed": "#388E3C",
    "states": {
      "modifierActive": { "text": "#FFFF00" },
      "modifierLocked": { "text": "#FFFF00", "background": "#388E3C" },
      "pressed": { "background": "#2E7D32" }
    }
  }
}
```

Supported states are `modifierActive`, `modifierLocked`, and `pressed`. When
states overlap, their priority is `modifierActive < modifierLocked < pressed`.
Only fields specified by a state are replaced. `ascii_mode` and `composing`
remain status variants rather than color states.

Pressed and locked keys hide the normal shadow by default, preserving the
standard press feedback. To explicitly show a shadow in either state, set its
state's `shadow` field; a transparent value can be used to keep the shadow
effectively invisible.

Gesture objects have their own patch fields. A gesture reference can override
`label`, `hint`, `action`/`actions`, `macro`, `repeat`, and `popup`; when `popup`
is omitted, the referenced gesture's value is inherited. A `hold` reference
can additionally override its `start`/`action`/`actions` and
`end`/`endAction`/`endActions` fields. These gesture patches are nested inside
`tap`, `doubleTap`, `swipe`, `longPress`, or `hold` as appropriate.

An explicit `null` clears the inherited value rather than acting as "not
specified". `label: null` clears the label to an empty string instead of
inheriting the referenced label. For `weight` and `height`, `null` restores the
parser default `1`.

The following are cleared by an explicit `null`:

- Nullable key fields: `label` (empty), `textSize`, `hintTextSize`,
  `shiftedLabel`, `statusLabel`, `icon`, `id`, `modifier`, `keyType`, `colors`.
- Optional gestures: `doubleTap`, `longPress`, and `hold` are removed.
- `swipe: null` clears all inherited swipe gestures. Individual swipe directions
  can instead be removed with `null` inside a `swipe` object.
- Gesture-reference fields: a `label` or `hint` is blanked, `popup` becomes
  `false`, and `action`/`actions` become an empty list. This applies to both a
  gesture reference and a gesture object written inline.

`tap: null` intentionally keeps the inherited click gesture because every key
must retain a valid tap action. It is the only `null` that does not clear.

`swipe` is merged by direction. An object adds or replaces a direction, while
`null` removes it:

```json
{
  "ref": "qwerty.space",
  "override": {
    "swipe": {
      "up": null,
      "left": { "ref": "rime.Left" }
    },
    "longPress": null
  }
}
```

The example removes the up swipe, replaces/adds the left swipe, and removes
long press. `longPress` and `hold` replace the corresponding optional gesture;
`null` removes them. `tap` is required by the key model, so `tap: null`
preserves the inherited click gesture rather than removing it. A key must
still have a valid click gesture after patching.

Gesture references can patch their presentation and action:

```json
{
  "keys": {
    "qwerty.x.down": {
      "ref": "foxy.Cut",
      "label": "剪切"
    },
    "qwerty.x": {
      "ref": "rime.x",
      "swipe": {
        "down": { "ref": "qwerty.x.down" }
      }
    }
  }
}
```

Here `qwerty.x.down` reuses the `foxy.Cut` click action, but changes its
display label to `剪切`. The `qwerty.x` definition then binds that gesture to
its down-swipe direction. For a gesture `ref`, `label`, `hint`,
`action`/`actions`, `macro`, `repeat`, and `popup` are applied to the referenced
click gesture. If `popup` is omitted, the referenced gesture's value is
inherited; an explicit value in the outer gesture or its `override` replaces
it. An explicit `null` clears instead: the `label`/`hint` is blanked, `popup`
becomes `false`, and `action`/`actions` become empty. This effective value is
preserved when a referenced click gesture becomes a directional swipe.
`override` can contain the same fields. A `hold` reference
is supported only when the referenced key already has a hold gesture; its
`label`, `hint`, `popup`, `start`/`action`/`actions`, and
`end`/`endAction`/`endActions` fields can replace or inherit the corresponding
parts.

Directional hint-size patches merge by direction, so unspecified directions
retain the base definition's values.

## Row Layouts

```json
{
  "keys": {},
  "layouts": {
    "default": {
      "sections": [{
        "type": "rows",
        "rows": [
          [
            { "ref": "rime.q" },
            { "ref": "rime.w" }
          ],
          {
            "width": 0.9,
            "keys": [
              { "ref": "rime.a" },
              { "ref": "rime.s" }
            ]
          }
        ]
      }]
    }
  }
}
```

Rows may be arrays or objects containing `keys`. In the public named-layout
format, if `height` is omitted, all rows in that rows section receive the same
default height. The default total height is five layout units, so a four-row
keyboard receives `1.25` units per row.

This average-height rule is part of `layouts -> sections -> rows`.

Supported row properties:

- `width`: fraction of the available keyboard width. The row is centered.
- `height`: explicit row height in layout units.
- `totalWeight`: total horizontal weight when the row uses `weight: "auto"`.

`weight` controls a key's horizontal share. `weight: "auto"` gives the key the
remaining width when `totalWeight` is provided.

### Row and Key Height

The keyboard uses layout height units. A normal four-row keyboard has a total
height of five units, so an unspecified row height defaults to:

```text
5 / number of rows
```

For example, four rows each receive `1.25` units. This default applies equally
to array rows and object rows. A row can override it explicitly. The following
is a row object fragment used inside a rows array:

```json
{
  "height": 1.5,
  "keys": [
    { "ref": "rime.q" }
  ]
}
```

The row height controls the vertical space allocated to the row. A key's
optional `height` controls its vertical size inside the row. If omitted, a key
has height `1.0` and fills the row. When keys in one row have different
heights, the row uses the largest key height as its row unit for layout.

```json
{
  "height": 1.25,
  "keys": [
    { "ref": "rime.q", "height": 1.0 },
    { "ref": "rime.Return", "height": 1.25 }
  ]
}
```

`width` changes only the horizontal width and centering of a row; it does not
change row height. For switchable layouts, the total height units should stay
compatible so switching does not resize the keyboard unexpectedly.

## Grid Layouts

```json
{
  "keys": {},
  "layouts": {
    "numpad": {
      "sections": [{
        "type": "grid",
        "columns": 5,
        "rows": 4,
        "keys": [
          {
            "column": 0,
            "row": 0,
            "ref": "rime.KP_Add"
          },
          {
            "column": 4,
            "row": 2,
            "rowSpan": 2,
            "ref": "rime.KP_Enter",
            "override": {
              "keyType": "ACTION",
              "icon": "enter"
            }
          }
        ]
      }]
    }
  }
}
```

Grid keys support `column`, `row`, `columnSpan`, and `rowSpan`. Grid cells may
not overlap or extend outside the declared grid.

If `rowHeights` is omitted, grid rows receive equal heights.

The bundled numpad keeps layout-specific appearance in the layout file. Every
key in the left column is marked `FUNCTION`. The `/` and Backspace keys in the
right column are `FUNCTION`; the spanning Enter key remains `ACTION`.

## Named Layouts

Layouts are selected by their name:

```json
{
  "layouts": {
    "default": {
      "sections": [
        {
          "type": "rows",
          "rows": [[{ "ref": "rime.a" }]]
        }
      ]
    },
    "numpad": {
      "sections": [
        {
          "type": "grid",
          "columns": 5,
          "rows": 4,
          "keys": []
        }
      ]
    }
  }
}
```

`default` is the normal alphabetic layout. `numpad` is the numeric layout.
Other names can be selected by Foxy actions or schema-specific layout lookup.

Each layout may contain multiple `sections`, using either `rows` or `grid`.

### Text Editor Layout

`text_editor` is a special named layout opened with the `text_editor` app
command; do not use `switch_layout` to enter it. Foxy renders its fixed cursor
touchpad above the layout's key row. Swiping the touchpad sends cursor keys;
long-pressing and then swiping holds Shift to extend a selection.

The layout must have exactly one `rows` section containing exactly one row.
Foxy renders that row as normal `KeyView` keys, so labels, weights, icons,
click/double-click, swipes, long-press repeat, holds, modifiers, and popup keys
behave like the regular keyboard. The row is fully configurable. A missing or
invalid `text_editor` layout falls back to Foxy's built-in English row.

Open it from any key gesture with `app: text_editor`; include a standard layout
switch such as `foxy.LayoutDefault` (`ABC`) in the row to return:

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

### Split Keyboard Layouts

A named layout may provide an optional `split` layout fragment for devices or
user settings that request a split keyboard. `split` is not a new named layout
and is not selected through `switch_layout`; it is an alternate arrangement of
the containing named layout:

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

The `split` object uses the same `sections`, `rows`, `grid`, key references,
weights, heights, gestures, and appearance rules as a regular layout. It is
defined explicitly because Foxy does not automatically divide rows or move
keys when split mode is requested. Use `foxy.Spacer` or weighted keys to
reserve the center gap, and keep every placed key's click action valid.

Resolution first selects the named layout, including its schema/status layout
variant, and then uses that selected object's `split` when split mode is
requested. If split mode is not requested, or the selected named layout has no
`split`, its normal `sections` are used. A split fragment that cannot be
parsed falls back to the normal `sections`; profile validation still rejects a
profile containing an invalid split fragment. Split fragments are parsed as
layout data and do not resolve their own named-layout `variants`.

The normal and split arrangements should use compatible total height units so
switching between them does not resize the keyboard unexpectedly. A split
layout can reuse the same top-level `keys`, `actions`, and `macros` as its
containing profile.

### Layout Variants

A named layout may select another complete named layout when a Rime status
condition matches. The variant uses `layout` and does not contain inline
`sections`; the two layouts are not merged.

```json
{
  "layouts": {
    "luna_pinyin": {
      "sections": [{ "type": "rows", "rows": [[{ "ref": "rime.a" }]] }],
      "variants": [{
        "when": { "rime": { "ascii_mode": true } },
        "layout": "default"
      }]
    },
    "default": {
      "sections": [{ "type": "rows", "rows": [[{ "ref": "rime.q" }]] }]
    }
  }
}
```

The last matching variant wins. References resolve only within the same
profile. A referenced layout must exist, and cycles are invalid. This allows a
schema-specific layout to use the profile's full `default` layout in ASCII mode.

### Layout Keyboard Height Override

A named layout may define a layout-level `override` object to replace the
global keyboard body height for that layout only. Height values are fractions
of the screen height, in the range `0.0` to `1.0`:

```json
{
  "layouts": {
    "luna_pinyin": {
      "override": {
        "keyboardHeightPercent": 0.32,
        "keyboardHeightPercentLandscape": 0.32
      },
      "sections": [
        {
          "type": "rows",
          "rows": [[{ "ref": "rime.a" }]]
        }
      ]
    }
  }
}
```

`keyboardHeightPercent` applies in portrait orientation and
`keyboardHeightPercentLandscape` applies in landscape orientation. When the
active layout defines the corresponding value, it takes precedence over the
global keyboard height setting. A layout without a height override continues
to use the global setting.

When keyboard adjust mode changes the height, dragging updates only the live
preview. The value is written when the user completes the adjustment. If the
active layout has a height override, the corresponding orientation field in
that layout's `override` object is updated; otherwise the global orientation-
specific setting is updated. Cancelling the adjustment does not persist the
preview.

## Built-in Definition Policy

Layout authors should reference `rime.*` or `foxy.*` definitions instead of
writing internal `KeyCode` names in JSON. For example:

```json
"tap": { "ref": "rime.Escape" }
```

is preferred over an inline action containing `ESCAPE`. This keeps layout
files independent of Android implementation names and makes the file easier
to read and maintain.

## Validation Checklist

- The file is valid JSON.
- Every `ref` resolves to a built-in or user-defined key.
- Every key has a click gesture after references are resolved.
- Gesture references inherit `popup` unless explicitly overridden; an explicit
  `null` sets it to `false`.
- Swipe conversion preserves the effective gesture `popup` value.
- A key does not define both `hold` and `longPress`.
- Rows with `weight: "auto"` provide a valid `totalWeight`.
- Grid cells do not overlap and remain inside the grid.
- Switchable layouts use compatible total height units.
- If a named layout defines `split`, it has valid `sections` and is parsed
  independently from the normal layout.
- Normal and split arrangements use compatible total height units.
