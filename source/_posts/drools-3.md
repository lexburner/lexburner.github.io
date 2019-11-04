---
title:  drools 用户指南 ----Methods vs Rules
date: 2017-04-11 13:28:44
tags: 
- 规则引擎
- drools
categories: 
- 规则引擎
---



## Methods vs Rules ##

人们经常混淆方法和规则，初学者经常会问：“我如何理解规则的含义？“ 在最后一节之后，你会对规则的使用得心应手，答案也变得显而易见的，但在这之前，先让我们总结一下方法判断和规则的差异。

```java
public void helloWorld(Person person) {
    if (person.getName().equals("Chuck") ) {
        System.out.println("Hello Chuck");
    }
}
```

1. 方法是被直接调用的
2. 需要传递具体的实例
3. 一个调用导致一次执行（One call results in a single execution）。

```java
rule "Hello World" when
    Person(name == "Chuck")
then
    System.out.println("Hello Chuck");
end
```

1. 只要将其插入引擎，就可以通过匹配任何数据执行规则。
2. 规则永远无法被直接调用，而只能触发
3. 无法将特定的实例传递给规则
4. 根据匹配，一个规则可能会触发一次或多次，或根本不被触发。

