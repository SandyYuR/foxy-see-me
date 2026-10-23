'use strict';

/*
 * Adapter template for run-conformance.js.
 *
 * Copy this file into the editor repository and implement both hooks against
 * the editor's own compiler. The only required output is the canonical shape
 * used by conformance/cases/<case>/expected.json; see conformance/README.md.
 */
module.exports = {
  // Optional. Return true when the editor accepts every named layout in the
  // profile, matching `expected.profile`.
  validateProfile(input, meta) {
    throw new Error('validateProfile(input, meta) is not implemented');
  },

  // Required. Compile one named layout under the given Rime status.
  //
  // meta = {
  //   name, layoutId, schemaId, splitRequested, statusName,
  //   status: { schemaId, schemaName, isDisabled, isComposing, isAsciiMode,
  //             isFullShape, isSimplified, isTraditional, isAsciiPunct, options },
  // }
  //
  // Return the same object shape as expected.statuses[statusName], or null when
  // the layout cannot be compiled.
  compile(input, meta) {
    // Example wiring for a JS editor:
    //
    //   const profile = editor.normalizeProfile(input);
    //   const compiled = editor.compileLayout(profile, meta.layoutId, {
    //     status: meta.status,
    //     split: meta.splitRequested,
    //   });
    //   return mapCompiledToConformance(compiled);
    //
    // `mapCompiledToConformance` is editor-specific: it must emit the field
    // names and ordering documented in conformance/README.md.
    throw new Error('compile(input, meta) is not implemented');
  },
};
