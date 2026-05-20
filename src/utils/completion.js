/**
 * Shell completion generator — produces bash/zsh completion scripts
 * so users can tab-complete loom commands and flags.
 *
 * Usage:
 *   source <(loom completion bash)
 *   source <(loom completion zsh)
 *
 * Or install permanently:
 *   loom completion bash > /etc/bash_completion.d/loom
 *   loom completion zsh > /usr/local/share/zsh/site-functions/_loom
 */

const COMMANDS = [
  "init",
  "wizard",
  "generate",
  "scaffold",
  "validate",
  "usage",
  "customize",
  "add-report",
  "doctor",
  "check",
  "upgrade",
  "backup",
  "rollback",
  "cleanup",
  "finalize",
  "env",
  "preset",
  "rename",
  "remove",
  "make:resource",
  "explain",
  "help",
];

const SUBCOMMANDS = {
  generate: ["resource", "module", "page", "theme", "deploy"],
  scaffold: ["parking", "payroll", "inventory", "booking", "delivery"],
  validate: ["parking", "payroll", "inventory", "booking", "delivery"],
  customize: ["theme", "layout", "brand", "data", "ui", "font", "css",
    "list-themes", "list-layouts", "list-data", "list-ui", "list-fonts"],
  backup: ["list", "restore"],
  cleanup: ["minimal", "production", "template"],
};

const CUSTOMIZE_SUB = {
  theme: ["set", "import", "preset"],
  layout: ["set"],
  brand: ["set"],
  data: ["set"],
  ui: ["set"],
  font: ["set", "list"],
};

const THEME_PRESET_SUB = ["apply", "save", "list", "open"];

const GLOBAL_FLAGS = ["--help", "--version", "--quiet", "-q", "--json",
  "--no-color", "--debug", "-y", "--yes", "--brief"];

const GENERATE_FLAGS = ["--fields", "--file", "--arch", "--architecture",
  "--relations", "--crud", "--form-mode", "--interactive", "--amend",
  "--remove-fields", "--force", "--with-tests", "--no-frontend", "--dry-run"];

export function generateBashCompletion() {
  return `# loom CLI bash completion
_loom_completions() {
  local cur prev words cword
  _init_completion || return

  # Global flags
  if [[ "$cur" == -* ]]; then
    COMPREPLY=($(compgen -W "$\x7BGLOBAL_FLAGS[*]}" -- "$cur"))
    return
  fi

  # Top-level command
  if [[ $cword -eq 1 ]]; then
    COMPREPLY=($(compgen -W "$\x7BCOMMANDS[*]}" -- "$cur"))
    return
  fi

  local cmd="$\x7Bwords[1]}"

  case $cmd in
    generate)
      if [[ $cword -eq 2 ]]; then
        COMPREPLY=($(compgen -W "resource module page theme deploy" -- "$cur"))
      elif [[ $cword -ge 3 ]]; then
        COMPREPLY=($(compgen -W "$\x7BGENERATE_FLAGS[*]}" -- "$cur"))
      fi
      ;;
    scaffold|validate)
      if [[ $cword -eq 2 ]]; then
        COMPREPLY=($(compgen -W "parking payroll inventory booking delivery" -- "$cur"))
      fi
      ;;
    customize)
      if [[ $cword -eq 2 ]]; then
        COMPREPLY=($(compgen -W "theme layout brand data ui font css list-themes list-layouts list-data list-ui list-fonts" -- "$cur"))
      elif [[ $cword -eq 3 && $\x7Bwords[2]} == "theme" ]]; then
        COMPREPLY=($(compgen -W "set import preset" -- "$cur"))
      elif [[ $cword -eq 4 && $\x7Bwords[2]} == "theme" && $\x7Bwords[3]} == "preset" ]]; then
        COMPREPLY=($(compgen -W "apply save list open" -- "$cur"))
      elif [[ $cword -eq 3 && $\x7Bwords[2]} == "layout" ]]; then
        COMPREPLY=($(compgen -W "set" -- "$cur"))
      elif [[ $cword -eq 3 && $\x7Bwords[2]} == "font" ]]; then
        COMPREPLY=($(compgen -W "set list" -- "$cur"))
      fi
      ;;
    backup)
      if [[ $cword -eq 2 ]]; then
        COMPREPLY=($(compgen -W "list restore" -- "$cur"))
      fi
      ;;
    cleanup)
      if [[ $cword -eq 2 ]]; then
        COMPREPLY=($(compgen -W "minimal production template" -- "$cur"))
      fi
      ;;
  esac
} &&
  complete -F _loom_completions loom
`;
}

export function generateZshCompletion() {
  return `#compdef loom
# loom CLI zsh completion

_loom_commands=(
  ${COMMANDS.map((c) => `"${c}:${getCmdDesc(c)}"`).join("\n  ")}
)

_loom_generate_types=("resource:Full-stack resource" "module:Backend module" "page:Frontend page" "theme:Import shadcn theme" "deploy:Deployment configs")
_loom_scenario_types=("parking:Parking management" "payroll:Payroll management" "inventory:Inventory management" "booking:Booking management" "delivery:Delivery management")
_loom_generate_flags=(${GENERATE_FLAGS.map((f) => `"${f}"`).join(" ")})
_loom_global_flags=(${GLOBAL_FLAGS.map((f) => `"${f}"`).join(" ")})

_loom() {
  local context state state_descr line
  typeset -A opt_args

  _arguments -C \\
    "1: :->cmds" \\
    "*: :->args" \\
    $_loom_global_flags

  case $state in
    cmds)
      _describe -t commands "loom command" _loom_commands
      ;;
    args)
      case $words[1] in
        generate)
          if [[ $CURRENT -eq 2 ]]; then
            _describe -t types "generate type" _loom_generate_types
          else
            _arguments $_loom_generate_flags
          fi
          ;;
        scaffold|validate)
          [[ $CURRENT -eq 2 ]] && _describe -t scenarios "scenario" _loom_scenario_types
          ;;
        customize)
          if [[ $CURRENT -eq 2 ]]; then
            _alternative \\
              "theme:theme:(set import preset)" \\
              "layout:layout:(set)" \\
              "brand:brand:(set)" \\
              "data:data:(set)" \\
              "ui:ui:(set)" \\
              "font:font:(set list)" \\
              "css:css:()" \\
              "list-themes:list-themes:()" \\
              "list-layouts:list-layouts:()" \\
              "list-data:list-data:()" \\
              "list-ui:list-ui:()" \\
              "list-fonts:list-fonts:()"
          elif [[ $CURRENT -eq 3 && $words[2] == "theme" ]]; then
            _describe -t presets "preset action" "apply:Resolve shadcn preset" "save:Save current theme" "list:List saved presets" "open:Open shadcn/create"
          fi
          ;;
        backup)
          [[ $CURRENT -eq 2 ]] && _describe -t actions "action" "list:List backups" "restore:Restore backup"
          ;;
        cleanup)
          [[ $CURRENT -eq 2 ]] && _describe -t presets "preset" "minimal:Remove demo content" "production:Full de-brand" "template:Extract reusable"
          ;;
      esac
      ;;
  esac
}

_loom
`;
}

function getCmdDesc(cmd) {
  const descs = {
    init: "Create a new project",
    wizard: "Interactive project builder",
    generate: "Generate resources, modules, pages",
    scaffold: "Generate scenario presets",
    validate: "Audit project against checklists",
    usage: "Write CLI_USAGE.md",
    "add-report": "Generate aggregation reports",
    customize: "Customize design and branding",
    doctor: "Check environment health",
    check: "Verify project structure",
    upgrade: "Check/apply template upgrades",
    backup: "Manage upgrade backups",
    rollback: "Undo last generation",
    cleanup: "De-brand project",
    finalize: "Prepare for production",
    env: "Diff/sync .env files",
    preset: "Apply configuration preset",
    rename: "Rebrand CLI command",
    remove: "Remove generated page or module",
    "make:resource": "Create resource from schema",
    explain: "Show project overview",
  };
  return descs[cmd] || "";
}

export function completion(shell) {
  if (shell === "bash") return generateBashCompletion();
  if (shell === "zsh") return generateZshCompletion();
  return `echo "Unsupported shell: ${shell}. Use 'bash' or 'zsh'."`;
}
