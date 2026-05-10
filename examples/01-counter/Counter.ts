import { MutableStateFlow, ViewModel, collectAsState, println, useViewModel } from "@jalvin/runtime";
import { Column } from "@jalvin/ui";
import { Row } from "@jalvin/ui";
import { Text } from "@jalvin/ui";
import { Button } from "@jalvin/ui";
import { Modifier } from "@jalvin/ui";
import { TextStyle } from "@jalvin/ui";
import { Color } from "@jalvin/ui";

export class CounterViewModel extends ViewModel {
  constructor() {
    super();
  }
  readonly count = new MutableStateFlow(0);

  increment() {
    count.update((it) => (it + 1));
  }

  decrement() {
    count.update((it) => (it - 1));
  }

  reset() {
    count.value = 0;
  }

}

export function Counter() {
  const vm = useViewModel("counter", (it) => new CounterViewModel());
  const count = collectAsState(vm.count);
  return Column({ modifier: Modifier.fillMaxWidth().padding(32), spacing: 24, horizontalAlignment: "center" }, [Text({ text: `Count: ${count}`, style: TextStyle.displaySmall, color: Color.OnSurface }), Row({ spacing: 12 }, [Button({ text: "-", variant: "outlined", onClick: (it) => vm.decrement() }), Button({ text: "Reset", variant: "text", onClick: (it) => vm.reset() }), Button({ text: "+", variant: "filled", onClick: (it) => vm.increment() })])]);
}

export function main() {
  println("Counter example — open in browser with Vite");
}

