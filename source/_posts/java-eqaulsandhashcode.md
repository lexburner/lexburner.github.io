---
title: JAVA 拾遗--eqauls 和 hashCode 方法
date: 2018-03-28 22:56:45
tags:
- JAVA
categories:
- JAVA
---

## 缘起—lombok 引发的惨案

> Lombok 是一种 Java™ 实用工具，可用于帮助开发人员消除 Java 的冗长，尤其是对于简单的 Java 对象（POJO）。它通过注解实现这一目的。

最近一个新项目中开始使用了 lombok，由于其真的是太简单易懂了，以至于我连文档都没看，直接就上手使用了，引发了一桩惨案。

**实体类定义**

```java
@Data
public class Project {
    private Long id;
    private String projectName;
    private List<Project> projects;
}
```

我在项目中设计了一个 Project 类，其包含了一个 List<Project> projects 属性，表达了项目间的依赖关系。@Data 便是 Lombok 提供的常用注解，我的本意是使用它来自动生成 getter/setter 方法。这样的实体类定义再简单不过了。

**意外出现**

使用 Project 类表达项目间的依赖关系是我的初衷，具体的分析步骤不在此赘述，对 Project 类的操作主要包括创建，打印，保存几个简单操作。运行初期，一切看似风平浪静，但经过长时间运行后，我意外的获得了如下的异常：

```Java
Exception in thread "Tmoe.cnkirito.dependency0" java.lang.StackOverflowError
 at moe.cnkirito.dependency.model.Project.hashCode(Project.java:20)
 at java.util.AbstracList.hashCode(AbstractList.java:541)
```

这让我感到很意外，我并没有对 Project 类进行什么复杂的操作，也没有进行什么递归操作，怎么会得到 StackOverflowError 这个错误呢？更令我百思不得其解的地方在于，怎么报错的日志中还出现了 hashCode 和 AbstractList 这两个家伙？等等…hashCode…emmmmm…我压根没有重写过它啊，怎么可能会报错呢….再想了想 Lombok 的 @Data 注解，我似乎发现了什么…emmmmm…抱着怀疑的态度翻阅了下 Lombok 的文档，看到了如下的介绍

> `@Data` is a convenient shortcut annotation that bundles the features of [`@ToString`](https://projectlombok.org/features/ToString), [`@EqualsAndHashCode`](https://projectlombok.org/features/EqualsAndHashCode), [`@Getter` / `@Setter`](https://projectlombok.org/features/GetterSetter) and [`@RequiredArgsConstructor`](https://projectlombok.org/features/constructor) together: In other words, `@Data` generates *all* the boilerplate that is normally associated with simple POJOs (Plain Old Java Objects) and beans: getters for all fields, setters for all non-final fields, and appropriate `toString`, `equals` and `hashCode` implementations that involve the fields of the class, and a constructor that initializes all final fields, as well as all non-final fields with no initializer that have been marked with `@NonNull`, in order to ensure the field is never null.

原来 @Data 注解不仅帮我们实现了生成了[`@Getter` / `@Setter`](https://projectlombok.org/features/GetterSetter) 注解，还包含了[`@ToString`](https://projectlombok.org/features/ToString), [`@EqualsAndHashCode`](https://projectlombok.org/features/EqualsAndHashCode), 和 [`@RequiredArgsConstructor`](https://projectlombok.org/features/constructor) 注解，这其中的 @EqualsAndHashCode 注解似乎和我这次的惨案密切相关了。顺藤摸瓜，看看 @EqualsAndHashCode 的文档：

> Any class definition may be annotated with `@EqualsAndHashCode` to let lombok generate implementations of the `equals(Object other)` and `hashCode()` methods. By default, it'll use all non-static, non-transient fields

@EqualsAndHashCode 会自动生成 `equals(Object other)` 和 `hashCode()` 两个方法，默认会使用所有非静态，非瞬时状态的字段。

回到我的案例中，也就是说，Lombok 会将 Project 类中的 List<Project> projects 当做是 hashCode 计算的一部分（同理，equals,toString 也会存在同样的问题），而如果我的项目中出现循环引用，这就会导致死循环，最终就会抛出 StackOverFlowError。

为了验证我的想法，简化的项目中的代码后，来测试下

```Java
public String testHashCode(){
    Project project = new Project();
    Project other = new Project();
    other.setProjects(Arrays.asList(project));
    project.setProjects(Arrays.asList(other));
    System.out.println(project.hashCode());
    return "success";
}
```

调用该代码后，复现了上述的异常。

```java
Exception in thread "Tmoe.cnkirito.dependency0" java.lang.StackOverflowError
 at moe.cnkirito.dependency.model.Project.hashCode(Project.java:20)
 at java.util.AbstracList.hashCode(AbstractList.java:541)
```

紧接着，继续测试下 toString 和 eqauls 方法

```Java
## 测试循环引用实体类中下的 toString 方法
java.lang.StackOverflowError: null
	at java.lang.AbstractStringBuilder.ensureCapacityInternal(AbstractStringBuilder.java:125) ~[na:1.8.0_161]
	at java.lang.AbstractStringBuilder.appendNull(AbstractStringBuilder.java:493) ~[na:1.8.0_161]
	at java.lang.AbstractStringBuilder.append(AbstractStringBuilder.java:446) ~[na:1.8.0_161]
	at java.lang.StringBuilder.append(StringBuilder.java:136) ~[na:1.8.0_161]
	at com.qianmi.dependency.model.Project.toString(Project.java:18) ~[classes/:na]
## 测试循环引用实体类中下的 equals 方法	
java.lang.StackOverflowError: null
	at java.util.AbstractList.rangeCheckForAdd(AbstractList.java:604) ~[na:1.8.0_161]
	at java.util.AbstractList.listIterator(AbstractList.java:325) ~[na:1.8.0_161]
	at java.util.AbstractList.listIterator(AbstractList.java:299) ~[na:1.8.0_161]
	at java.util.AbstractList.equals(AbstractList.java:518) ~[na:1.8.0_161]
	at com.qianmi.dependency.model.Project.equals(Project.java:18) ~[classes/:na]
```

不出所料，都存在同样的问题。

这一案例可以稍微总结下，一是在使用新的技术框架（Lombok）之前没有看文档，对其特性不太了解，望文生义，认为 @Data 不会重写 hashCode 等方法，二是没有考虑到 hashCode，eqauls 等方法应该如何正确地覆盖。

## 回顾 JAVA 中最基础的方法： hashCode 和 equals

这两个方法说是 JAVA 最基础的方法一点不为过，但往往越基础的东西越容易被人忽视，让我想起了 JAVA 闲聊群中一位长者经常吐槽的一点：『现在的面试、群聊动不动就是高并发，JVM，中间件，却把基础给遗忘了』。 我感觉很幸运，在当初刚学 JAVA 时，便接触了一本神书《effective java》，一本号称怎么夸都不为过的书，它的序是这么写的

> 我很希望10年前就拥有这本书。可能有人认为我不需要任何Java方面的书籍，但是我需要这本书。
>
> ——Java 之父 James Gosling

其书中的第三章第 8 条，第 9 条阐述了 equals 和 hashCode 的一些重写原则，我将一些理论言简意赅的阐述在本节中，喜欢的话推荐去看原书哦。

### 第8条：覆盖`equals`时请遵守通用约定

> 什么时候应该覆盖`Object.equals`呢？如果类具有自己特有的“逻辑相等”概念（不同于对象等同的概念），而且超类还没有覆盖`equals`以实现期望的行为，这时我们就需要覆盖`equals`方法。这通常属于“值类（value class）”的情形。值类仅仅是一个表示值的类，例如`Integer`或者`Date`。程序员在利用`equals`方法来比较值对象的引用时，希望知道它们在逻辑上是否相等，而不是想了解它们是否指向同一个对象。为了满足程序员的要求，不仅必需覆盖`equals`方法，而且这样做也使得这个类的实例可以被用作映射表（map）的键（key），或者集合（set）的元素，使映射或者集合表现出预期的行为。
>
> 在覆盖`equals`方法的时候，你必须要遵守它的通用约定。下面是约定的内容，来自`Object`的规范[JavaSE6]：
>
> `equals`方法实现了*等价关系（equivalence relation）*：
>
> - **自反性（reflexive）**。对于任何非`null`的引用值`x`，`x.equals(x)`必须返回`true`。
> - **对称性（symmetric）**。对于任何非`null`的引用值`x`和`y`，当且仅当`y.equals(x)`返回`true`时，`x.equals(y)`必须返回`true`。
> - **传递性（transitive）**。对于任何非`null`的引用值`x`、`y`和`z`。如果`x.equals(y)`返回`true`，并且`y.equals(z)`也返回`true`，那么`x.equals(z)`也必须返回`true`。
> - **一致性（consistent）**。对于任何非`null`的引用值`x`和`y`，只要`equals`的比较操作在对象中所用的信息没有被修改，多次调用`x.equals(x)`就会一致地返回`true`，或者一致的返回`false`。
> - 对于任何非`null`的引用值`x`，`x.equals(null)`必须返回`false`。

学过高数，离散的同学不会对上述的理论陌生，它们源自于数学理论，没了解过这些概念的同学也不必有所顾忌，因为你只需要养成习惯，在设计一个实体类时时刻惦记着上述几个关系，能符合的话大概就没有问题。结合所有这些要求，得出了以下实现高质量`equals`方法的诀窍：

1. **使用==操作符检查“参数是否为这个对象的引用”**。如果是，则返回`true`。这只不过是一种性能优化，如果比较操作有可能很昂贵，就值得这么做。

2. **使用 instanceof 操作符检查“参数是否为正确的类型”**。如果不是，则返回`false`。一般说来，所谓“正确的类型”是指`equals`方法所在的那个类。有些情况下，是指该类所实现的某个接口。如果类实现的接口改进了`equals`约定，允许在实现了该接口的类之间进行比较，那么就使用接口。集合接口（collection interface）如`Set`、`List`、`Map`和`Map.Entry`具有这样的特性。

3. **把参数转换成正确的类型**。因为转换之前进行过`instanceof`测试，所以确保会成功。

4. **对于该类中每个“关键（significant）域，检查参数中的域是否与该对象中对应的域相匹配”**。如果这些测试全部成功，则返回`true`；否则返回`false`。如果第2步中的类型是个借口，就必须通过接口方法访问参数中的域；如果该类型是个类，也许就能够直接访问参数中的域，这要取决于它们的可访问性。

   对于既不是`float`也不是`double`类型的基本类型域，可以使用`==`操作符进行比较；对于对象引用域，可以递归地调用`equals`方法；对于`float`域，可以使用`Float.compare`方法；对于`double`域，则使用`Double.compare`。对于`float`和`double`域进行特殊的处理是有必要的，因为存在着`Float.NaN`、`-0.0f`以及类似的`double`常量；详细信息请参考`Float.equals`的文档。对于数组域，则要把以上这些指导原则应用到每个元素上。如果数组域中的每个元素都很重要，就可以使用发行版本1.5中新增的其中一个`Arrays.equals`方法。

   有些对象引用域包含`null`可能是合法的，所以，为了避免可能导致`NullPointerException`异常，则使用下面的习惯用法来比较这样的域：

   ```java
   (field == null ? o.field == null : field.equals(o.field))
   ```

   如果`field`域和`o.field`通常是相同的对象引用，那么下面的做法就会更快一些：

   ```java
   (field == o.field || (field != null && field.equals(o.field)))
   ```

5. **当你编写完成了equals方法之后，应该问自己三个问题：它是不是对称的、传递的、一致的？**并且不要只是自问，还要编写单元测试来检验这些特性！如果答案是否定的，就要找出原因，再相应地修改`equals`方法的代码。当然，`equals`方法也必须满足其他两个特性（自反性和非空性），但是这两种特性通常会自动满足。

其他原则还包括：

- **覆盖 equals 时总要覆盖 hashCode**。(在下一节中介绍)
- **不要企图让 equals 方法过于智能**。如果只是简单地测试域中的值是否相等，则不难做到遵守`equals`约定。如果想过度地去寻求各种等价关系，则很容易陷入麻烦之中。把任何一种别名形式考虑到等价的范围内，往往不会是个好主意。例如，`File`类不应该视图把指向同一个文件的符号链接（symbolic link）当作相等的对象来看待。所幸`File`类没有这样做。
- **不要将 equals 声明中的 Object 对象替换为其他的类型**。

### 第9条：覆盖`equals`时总要覆盖`hashCode`

> 一个很常见的错误根源在于没有覆盖`hashCode`方法。*在每个覆盖了equals方法的类中，也必须覆盖hashCode方法*。如果不这样做的话，就会违反`Object.hashcode`的通用约定，从而导致该类无法结合所有基于散列的集合一起正常工作，这样的集合包括`HashMap`、`HashSet`和`Hashtable`。
>
> 下面是约定的内容，摘自`Object`规范[JavaSE6]：
>
> - 在应用程序的执行期间，只要对象的`equals`方法的比较操作所用到的信息没有被修改，那么对同一个对象调用多次，`hashCode`方法都必须始终如一地返回同一个整数。在同一个应用程序的多次执行过程中，每次执行所返回的整数可以不一致。
> - 如果两个对象根据`equals(Object)`方法比较是相等的，那么调用这两个对象中任意一个对象的`hashCode`方法都必须产生同样的整数结果。
> - 如果两个对象根据`equals(Object)`方法比较是不相等的，那么调用这两个对象中任意一个对象的`hashCode`方法，则不一定要产生不同的整数结果。但是程序员应该知道，给不相等的对象产生截然不同的整数结果，有可能提高散列表（hash table）的性能。
>
> *因没有覆盖hashCode而违反的关键约定是第二条：相等的对象必须具有相等的散列码*（hash code）。根据类的`equals`方法，两个截然不同的实例在逻辑上有可能是相等的，但是，根据`Object`类的`hashCode`方法，它们仅仅是两个没有任何共同之处的对象。因此，对象的`hashCode`方法返回两个看起来是随机的整数，而不是根据第二个约定所要求的那样，返回两个相等的整数。

默默看完书中的文字，是不是觉得有点哲学的韵味呢，写好一手代码真的不容易。

## 实战中如何重写 hashCode 和 equals？

hashCode 和 equals 很重要，在使用中，与之密切相关的一般是几个容器类：HashMap 和 HashSet，意味着当我们将一个类作为其中的元素时，尤其需要考量下 hashCode 和 equals 的写法。

话不多数，即刻介绍。对了，你指望我手敲 hashCode 和 equals 吗？不存在的，程序员应该优雅的偷懒，无论你是 eclipse 玩家还是 idea 玩家，都能找到对应的快捷键，帮你自动重写这两个方式，我们要做的就是对参数的选择做一些微调。例如使用 idea 生成下面这个类的 hashCode 和 equals 方法，设置前提：将所有字段当做关键（significant）域。

```java
public class Example {
    private int a;
    private float b;
    private double c;
    private BigDecimal d;
    private char e;
    private byte f;
    private String g;
}
```

## 方法一：Intellij Default

```java
@Override
public boolean equals(Object o) {
    if (this == o) return true;
    if (o == null || getClass() != o.getClass()) return false;
    if (!super.equals(o)) return false;

    Example example = (Example) o;

    if (a != example.a) return false;
    if (Float.compare(example.b, b) != 0) return false;
    if (Double.compare(example.c, c) != 0) return false;
    if (e != example.e) return false;
    if (f != example.f) return false;
    if (!d.equals(example.d)) return false;
    return g.equals(example.g);
}

@Override
public int hashCode() {
    int result = super.hashCode();
    long temp;
    result = 31 * result + a;
    result = 31 * result + (b != +0.0f ? Float.floatToIntBits(b) : 0);
    temp = Double.doubleToLongBits(c);
    result = 31 * result + (int) (temp ^ (temp >>> 32));
    result = 31 * result + d.hashCode();
    result = 31 * result + (int) e;
    result = 31 * result + (int) f;
    result = 31 * result + g.hashCode();
    return result;
}
```

这可能是大家最熟悉的方法，先来分析下 equals 的写法。看样子的确是遵循了《effective java》中提及的 java1.6 规范的，值得注意的点再强调下：Float 和 Double 类型的比较应该使用各自的静态方法 Float.compare 和 Double.compare。

hashCode 方法则更加有趣一点，你可能会有如下的疑问：

- Double.doubleToLongBits 是干嘛用的？
- 为啥是 31？
- 为什么还有 ^，>>> 这些运算符号？

带着疑问来看看下面的解释。

一个好的散列函数通常倾向于“为不相等的对象产生不相等的散列码”。这正是上一节中`hashCode`约定中第三条的含义。理想情况下，散列函数应该把集合中不相等的实例均匀地分布到所有可能的散列值上。要想完全达到这种理想的情形是非常困难的。但相对接近这种理想情形则并不太苦难。《effective java》给出了一种简单的解决办法：

> 1. 把某个非零的常数值，比如说17，保存在一个名为`result`的`int`类型的变量中。
>
> 2. 对于对象中每个关键域`f`（指`equals`方法中涉及的每个域），完成以下步骤：
>
>    a. 为该域计算`int`类型的散列码`c`:
>
>    i. 如果该域是`boolean`类型，则计算`(f ? 1 : 0)`.
>
>    ii. 如果该域是`byte`、`char`、`short`或者`int`类型，则计算`(int)f`。
>
>    iii. 如果该域是`long`类型，则计算`(int)(f ^ (f >>> 32))`。
>
>    iv. 如果该域是`float`类型，则计算`Float.floatToIntBits(f)`。
>
>    v. 如果该域是`double`类型，则计算`Double.doubleToLongBits(f)`，然后按照步骤2.a.iii，为得到的`long`类型值计算散列值。
>
>    vi. 如果该域是一个对象引用，并且该域的`equals`方法通过递归地调用`equals`的方式来比较这个域，则同样为这个域递归地调用`hashCode`。如果需要更复杂的比较，则为这个域计算一个“范式（canonical representation）”，然后针对这个范式调用`hashCode`。如果这个域的值为`null`，则返回0（或者其他某个常数，但通常是0）。
>
>    vii. 如果该域是一个数组，则要把每一个元素当做单独的域来处理。也就是说，递归地应用上述规则，对每个重要的元素计算一个散列码，然后根据步骤2.b中的做法把这些散列值组合起来。如果数组域中的每个元素都很重要，可以利用发行版本1.5中增加的其中一个`Arrays.hashCode`方法。
>
>    b. 按照下面的公式，把步骤2.a中计算得到的散列码`c`合并到`result`中：
>
>    ```
>    result = 31 * result + c;
>    ```
>
> 3. 返回result。
>
> 4. 写完了`hashCode`方法之后，问问自己“相等的实例是否都具有相等的散列码”。要编写单元测试来验证你的推断。如果相等实例有着不相等的散列码，则要找出原因，并修正错误。
>
> 在散列码的计算过程中，可以把*冗余域（redundant field）*排除在外。换句话说，如果一个域的值可以根据参与计算的其他域值计算出来，则可以把这样的域排除在外。必须排除`equals`比较计算中没有用到的任何域，否则很有可能违反`hashCode`约定的第二条。
>
> 上述步骤1中用到了一个非零的初始值，因此步骤2.a中计算的散列值为0的那些初始域，会影响到散列值。如果步骤1中的初始值为0，则整个散列值将不受这些初始域的影响，因为这些初始域会增加冲突的可能性。值`17`则是任选的。
>
> 步骤2.b中的乘法部分使得散列值依赖于域的顺序，如果一个类包含多个相似的域，这样的乘法运算就会产生一个更好的散列函数。例如，如果`String`散列函数省略了这个乘法部分，那么只是字母顺序不同的所有字符串都会有相同的散列码。之所以选择31，是因为它是一个奇素数。如果乘数是偶数，并且乘法溢出的话，信息就会丢失，因为与2相乘等价于位移运算。使用素数的好处并不很明显，但是习惯上都使用素数来计算散列结果。31有个很好的特性，即用位移和减法来代替乘法，可以得到更好的性能，`31 * i == (i << 5) - i`。现代的VM可以自动完成这种优化。

是不是几个疑惑都解开了呢？

## 方法二：Objects.hash 和 Objects.equals

```Java
@Override
public boolean equals(Object o) {
    if (this == o) return true;
    if (o == null || getClass() != o.getClass()) return false;
    if (!super.equals(o)) return false;
    Example example = (Example) o;
    return a == example.a &&
            Float.compare(example.b, b) == 0 &&
            Double.compare(example.c, c) == 0 &&
            e == example.e &&
            f == example.f &&
            Objects.equals(d, example.d) &&
            Objects.equals(g, example.g);
}

@Override
public int hashCode() {
    return Objects.hash(super.hashCode(), a, b, c, d, e, f, g);
}
```

JAVA 是一个与时俱进的语言，有问题从自身解决，便利了开发者，如《effective java》所言，在 jdk1.6 中上述那些原则只是一纸空文。错误同真理的关系，就象睡梦同清醒的关系一样。一个人从错误中醒来，就会以新的力量走向真理。在 jdk1.7 中便造就了诸多的方法 Objects.hash 和 Objects.equals 帮助你智能的实现 hashCode 和 equals 方法。很明显，代码量上比方法一少了很多，并且有了 jdk 的原生支持，心里也更加有底了。

## 方法三：Lombok 的 @EqualsAndHashCode

前面已经提到了 Lombok 的这个注解，在此详细介绍下这个注解的用法，方便大家写出规范的 hashCode 和 equals 方法。

1. 此注解会生成`equals(Object other)` 和 `hashCode()`方法。 
2. 它默认使用非静态，非瞬态的属性 
3. 可通过参数`exclude`排除一些属性 
4. 可通过参数`of`指定仅使用哪些属性 
5. 它默认仅使用该类中定义的属性且不调用父类的方法 
6. 可通过`callSuper=true`解决上一点问题。让其生成的方法中调用父类的方法。

使用 Lombok 很便捷，整个代码也很清爽

```java
@Data
@EqualsAndHashCode(of = {"a","b","c","d","e","f","g"})//默认就是所有参数
public class Example {

    private int a;
    private float b;
    private double c;
    private BigDecimal d;
    private char e;
    private byte f;
    private String g;

}
```

如果想知道编译过后的庐山真面目，也可以在 target 包中找到 Example.java 生成的 Example.class，:

```java
public boolean equals(Object o) {
    if (o == this) {
        return true;
    } else if (!(o instanceof Example)) {
        return false;
    } else {
        Example other = (Example)o;
        if (!other.canEqual(this)) {
            return false;
        } else if (this.getA() != other.getA()) {
            return false;
        } else if (Float.compare(this.getB(), other.getB()) != 0) {
            return false;
        } else if (Double.compare(this.getC(), other.getC()) != 0) {
            return false;
        } else {
            Object this$d = this.getD();
            Object other$d = other.getD();
            if (this$d == null) {
                if (other$d != null) {
                    return false;
                }
            } else if (!this$d.equals(other$d)) {
                return false;
            }

            if (this.getE() != other.getE()) {
                return false;
            } else if (this.getF() != other.getF()) {
                return false;
            } else {
                Object this$g = this.getG();
                Object other$g = other.getG();
                if (this$g == null) {
                    if (other$g != null) {
                        return false;
                    }
                } else if (!this$g.equals(other$g)) {
                    return false;
                }

                return true;
            }
        }
    }
}

protected boolean canEqual(Object other) {
    return other instanceof Example;
}

public int hashCode() {
    int PRIME = true;
    int result = 1;
    int result = result * 59 + this.getA();
    result = result * 59 + Float.floatToIntBits(this.getB());
    long $c = Double.doubleToLongBits(this.getC());
    result = result * 59 + (int)($c >>> 32 ^ $c);
    Object $d = this.getD();
    result = result * 59 + ($d == null ? 43 : $d.hashCode());
    result = result * 59 + this.getE();
    result = result * 59 + this.getF();
    Object $g = this.getG();
    result = result * 59 + ($g == null ? 43 : $g.hashCode());
    return result;
}
```

大致和前两种行为一致，这里选择素数从 31 替换成了 59，没有太大差异。

## 总结

我在开发时也曾考虑一个问题：一个数据库持久化对象到底怎么正确覆盖 hashCode 和 equals？以订单为例，是用主键 id 来判断，还是 流水编号 orderNo 来判断，可能没有准确的答案，各有各的道理，但如果将它丢进 HashSet，HashMap 中就要额外注意，hashCode 和 equals 会影响它们的行为！

这次 Lombok 发生的惨案主要还是由于不合理的 hashCode 和 equals（也包括了 toString）方法导致的，循环引用这种问题虽然没有直接在《effective java》中介绍，但一个引用，一个集合类是不是应该作为 hashCode 和 equals 的关键域参与计算，还是值得开发者仔细推敲的。本文还介绍了一些 hashCode 和 equals 的通用原则，弱弱地推荐 Lombok 便捷开发，强烈安利《effective java》一书。