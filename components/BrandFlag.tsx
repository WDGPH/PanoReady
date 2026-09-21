/** Vector tracing of the brand pennant, with a fixed pole and waving cloth. */
export default function BrandFlag() {
  return (
    <svg className="brand-logo" width="40" height="40" viewBox="0 0 256 256" aria-hidden="true" focusable="false">
      <g className="brand-flag-cloth">
        <path className="brand-flag-fabric" fill="#ffd45e" stroke="#edba43" strokeWidth="1.5"
          d="M79 68 C108 51 134 56 158 72 C181 87 201 88 218 93 C234 98 191 125 168 138 C140 156 113 165 91 168 Z" />
        <path className="brand-flag-letter" fill="#394820" fillRule="evenodd"
          d="M103 91 C100 80 112 78 124 77 C142 74 155 84 157 96 C160 111 144 120 120 124 L125 140 C127 150 113 153 110 141 Z M118 91 L121 109 C133 107 144 103 142 96 C140 89 131 88 118 91 Z" />
      </g>
      <path fill="#fff9e8" stroke="#fffdf5" strokeWidth="2"
        d="M59 67 C43 57 54 37 67 39 C83 39 89 56 78 67 L96 210 C99 224 77 228 75 213 Z" />
    </svg>
  );
}
