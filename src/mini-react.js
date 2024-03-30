(function () {
  // MiniReact.createElement 就是我们实现的 render function
  /**
   *
   * @param {*} type 必选，表示元素类型，HTML元素，组件名（函数组件中就是函数名），Fragment，一个字符串。
   * @param {*} props 可选，传递给元素的props参数，一个对象
   * @param  {...any} children 可选，元素下的子内容。一个数组
   * @returns React Element的结构
   */
  function createElement(type, props, ...children) {
    return {
      type,
      // react中，元素中的子内容也被视为该元素的props的一部分。
      props: {
        ...props,
        children: children.map((child) => {
          // 最终的文本类型是没有children，不需要再遍历下去
          const isTextNode =
            typeof child === 'string' || typeof child === 'number';
          return isTextNode ? createTextNode(child) : child;
        }),
      },
    };
  }

  // 定义文本类型的React Element元素结构
  function createTextNode(nodeValue) {
    return {
      type: 'TEXT_ELEMENT',
      props: {
        nodeValue,
        children: [],
      },
    };
  }

  // vDOM转成Fiber的过程称之为reconcile。但他不是一次性完成的，而是通过scheduler调度器根据时间分片分成多个任务完成。

  // 指向下一个要处理的fiber节点
  let nextUnitOfWork = null;

  // 表示当前正在处理的fiber链表的根节点。wip表示正在的意思
  let wipRoot = null;

  // 旧的fiber链表根节点。current表示当前。
  let currentRoot = null;

  let deletions = null;

  // render阶段
  /**
   *
   * @param {*} element 第一次渲染的时候，拿到的是根组件的信息，type：App。类型是一个函数。需要执行该函数才能拿到App子组件的信息
   * @param {*} container <div id="root"></div>
   */
  function render(element, container) {
    // Tip: 打印render会在workLoop。render会同步执行，而workLoop会在空闲执行。
    // console.log('render');

    // 下面都在进行初始化操作。
    wipRoot = {
      dom: container, // 挂载的展示DOM节点
      props: {
        children: [element], // 第一次渲染的时候，element表示的就是我们的App组件的React Element
      },
      alternate: currentRoot, // 就的Fiber链表
    };

    deletions = [];

    // 当我们nextUnitOfWork设置值以后。由于workLoop不断执行，当发现nextUnitOfWork有值的时候，会进入遍历。
    nextUnitOfWork = wipRoot;
  }

  // 可以把workLoop看成类似一个递归函数，会反复循环执行。目的是为了当有需要处理的Fiber节点出现的时候，进行处理
  function workLoop(deadline) {
    // console.log('workLoop');
    // 是否暂停。闲置时间足够为false，不暂停。不够为true，暂停
    let shouldYield = false;
    while (nextUnitOfWork && !shouldYield) {
      nextUnitOfWork = performUnitOfWork(nextUnitOfWork);
      // 判断是都暂停
      shouldYield = deadline.timeRemaining() < 1;
    }

    if (!nextUnitOfWork && wipRoot) {
      commitRoot();
    }

    // 可以递归
    requestIdleCallback(workLoop);
  }

  // requestIdleCallback存在着浏览器的兼容性和触发不稳定的问题
  // react用的是requestAnimationFrame。
  // requestIdleCallback在浏览器空闲时执行回调函数。回调函数会接受一个IdleDeadline对象作为参数，该对象提供了关于浏览器空闲时间的信息
  requestIdleCallback(workLoop);

  // performUnitOfWork的作用就是遍历fiber树
  function performUnitOfWork(fiber) {
    // 不同的fiber节点会有不同的处理方式
    const isFunctionComponent = fiber.type instanceof Function;
    if (isFunctionComponent) {
      // 函数组件处理
      updateFunctionComponent(fiber);
    } else {
      // 原生标签处理
      updateHostComponent(fiber);
    }

    // 上面的方法处理完成我们当前Fiber之后，就会开始寻找下一个处理的Fiber，并返回出去
    // 会先从fiber.child一直找到尽头，之后回到上一个节点找他的相邻兄弟组件，然后继续child，依次循环最后回到div#root
    // 按照下面遍历的顺序，最终fiber树就会变成一个fiber链表。
    if (fiber.child) {
      return fiber.child;
    }
    let nextFiber = fiber;
    while (nextFiber) {
      if (nextFiber.sibling) {
        return nextFiber.sibling;
      }
      // 说明兄弟节点处理完成，回到上一个节点return。
      nextFiber = nextFiber.return;
    }
  }

  // 记录当前执行的fiber节点
  let wipFiber = null;
  let stateHookIndex = null;

  // 函数组件处理：
  function updateFunctionComponent(fiber) {
    wipFiber = fiber;

    // 初始化
    stateHookIndex = 0;
    // 当前节点里的useState、useEffect
    wipFiber.stateHooks = [];
    wipFiber.effectHooks = [];

    // 此时的fiber.type表示的是函数名。执行函数组件。函数组件的返回值React Element
    // console.log('返回结果', fiber.type(fiber.props));
    const children = [fiber.type(fiber.props)];
    reconcileChildren(fiber, children);
  }

  function updateHostComponent(fiber) {
    if (!fiber.dom) {
      fiber.dom = createDom(fiber);
    }
    reconcileChildren(fiber, fiber.props.children);
  }

  // 创建真实DOM。
  function createDom(fiber) {
    const dom =
      fiber.type == 'TEXT_ELEMENT'
        ? document.createTextNode('')
        : document.createElement(fiber.type);

    // 创建新DOM，意味着旧参数为空
    updateDom(dom, {}, fiber.props);

    return dom;
  }

  // 判断属性是不是事件，特征是前缀带on
  const isEvent = (key) => key.startsWith('on');
  // 属性
  const isProperty = (key) => key !== 'children' && !isEvent(key);
  // 属性值是否改变
  const isNew = (prev, next) => (key) => prev[key] !== next[key];
  // 属性是否已经不在新参数里
  const isGone = (prev, next) => (key) => !(key in next);

  // createDom已经创建好DOM，updateDom的工作是对当前的真实Dom的props进行更新，删除。首先删除旧的事件监听器，旧的属性，然后添加新的属性、新的事件监听器。
  /**
   *
   * @param {*} dom 已经创建好的真实DOM
   * @param {*} prevProps 旧的props参数
   * @param {*} nextProps 新的参数
   */
  function updateDom(dom, prevProps, nextProps) {
    //Remove old or changed event listeners
    Object.keys(prevProps)
      .filter(isEvent)
      .filter((key) => !(key in nextProps) || isNew(prevProps, nextProps)(key))
      .forEach((name) => {
        const eventType = name.toLowerCase().substring(2);
        dom.removeEventListener(eventType, prevProps[name]);
      });

    // Remove old properties。对于不在新参数里的属性，设置为空字符串。
    Object.keys(prevProps)
      .filter(isProperty)
      .filter(isGone(prevProps, nextProps))
      .forEach((name) => {
        dom[name] = '';
      });

    // Set new or changed properties。加入新属性。
    Object.keys(nextProps)
      .filter(isProperty)
      .filter(isNew(prevProps, nextProps))
      .forEach((name) => {
        dom[name] = nextProps[name];
      });

    // Add event listeners。增加事件
    Object.keys(nextProps)
      .filter(isEvent)
      .filter(isNew(prevProps, nextProps))
      .forEach((name) => {
        const eventType = name.toLowerCase().substring(2);
        dom.addEventListener(eventType, nextProps[name]);
      });
  }

  // 当前fiber节点下，处理他的子元素们
  /**
   *
   * @param {*} wipFiber 当前处理的节点
   * @param {*} elements 该节点的子元素数组
   */
  function reconcileChildren(wipFiber, elements) {
    let index = 0;
    // wipFiber.alternate表示的是旧Fiber链表。
    let oldFiber = wipFiber.alternate?.child;
    let prevSibling = null;

    // 将当前fiber下子元素child都处理成fiber节点
    // oldFiber != null 注意这里：undefined != null 结果 false，undefined !== null 结果true
    while (index < elements.length || oldFiber != null) {
      const element = elements[index];
      let newFiber = null;

      // 如果值undefined、null认为是相同节点。
      const sameType = element?.type == oldFiber?.type;

      // 节点类型相同 -> 那么只需要在原来的DOM上更新属性就行
      if (sameType) {
        // 定义fiber对象
        newFiber = {
          type: oldFiber.type,
          props: element.props,
          dom: oldFiber.dom,
          return: wipFiber,
          alternate: oldFiber,
          effectTag: 'UPDATE',
        };
      }

      // 新Fiber元素 -> 进入createDom
      if (element && !sameType) {
        newFiber = {
          type: element.type,
          props: element.props,
          dom: null,
          return: wipFiber,
          alternate: null,
          effectTag: 'PLACEMENT',
        };
      }

      // 旧fiber存在 && 类型不同 -> 说明是新的DOM不存在这部份，标记删除
      if (oldFiber && !sameType) {
        oldFiber.effectTag = 'DELETION';
        deletions.push(oldFiber);
      }

      // oldFiber设置成下一个兄弟节点，进行下一次同节点的比较
      if (oldFiber) {
        oldFiber = oldFiber.sibling;
      }

      if (index === 0) {
        // index为0作为当前处理节点的child，后续的index>0,则是child的兄弟节点sibling。
        wipFiber.child = newFiber;
      } else if (element) {
        // 此时的prevSibling表示的index-1的节点。即当前newFiber作为上一个fiber的兄弟节点。
        prevSibling.sibling = newFiber;
      }
      // 设置为当前节点，作为下次循环，给该节点设置兄弟节点
      prevSibling = newFiber;
      index++;
    }
  }

  // 当我们执行函数组件的时候，就会执行hook，进入到hook源码中来
  // 正常情况下，能保存hook信息的fiber，该fiber表示的是函数组件，例如App
  function useState(initialState) {
    const currentFiber = wipFiber;

    // 从节点，拿到旧的hook信息，里面保存了当前的state、stateHookIndex标志多少个useState被调用
    const oldHook = wipFiber.alternate?.stateHooks[stateHookIndex];

    const stateHook = {
      // 当前state的值
      state: oldHook ? oldHook.state : initialState,
      // 调用setState的时候，会将所有传入的函数，放入到queue数组中。
      queue: oldHook ? oldHook.queue : [],
    };

    // 执行setState，得到最新的sate结果
    stateHook.queue.forEach((action) => {
      stateHook.state = action(stateHook.state);
    });

    stateHook.queue = [];

    stateHookIndex++;
    wipFiber.stateHooks.push(stateHook);

    function setState(action) {
      // 当我们调用setState的时候，多个setState的调用传入的值，或者函数，都会暂时放入到queue中
      // 下面两行，保证存入的时候函数
      const isFunction = typeof action === 'function';
      stateHook.queue.push(isFunction ? action : () => action);

      // 对当前节点更新，加入stateHook的信息。
      wipRoot = {
        ...currentFiber,
        alternate: currentFiber,
      };
      // wipRoot表示当前节点，nextUnitOfWork表示等会要被处理的节点。集中加入stateHook信息之后，到下一次workLoop里再去处理。
      nextUnitOfWork = wipRoot;
    }

    return [stateHook.state, setState];
  }

  // 每个函数组件都会有需要执行的useEffect，当执行函数组件的时候，会开始调用useEffect，将回调函数先保存起来
  function useEffect(callback, deps) {
    const effectHook = {
      callback, // 回调函数
      deps, // 依赖数组
      cleanup: undefined, // 清理副作用
    };
    wipFiber.effectHooks.push(effectHook);
  }

  // 当我们将整棵树遍历成Fiber后，就可以进入commit阶段
  function commitRoot() {
    // 集中把标记删除的节点处理了。
    deletions.forEach(commitWork);
    // div#root本事已经存在，所以从child开始。
    commitWork(wipRoot.child);
    // commitWork完成真实DOM之后，就开始执行effectHook
    commitEffectHooks();

    // 前面的操作已经完成基本渲染，此时的wipRoot成为了就的fiber链表，保存到currentRoot，重制wipRoot
    currentRoot = wipRoot;
    wipRoot = null;
  }

  // 通过递归的方式，一步步将子元素appendChild插入父元素，界面一点点渲染出来。最终Fiber链表变成了真实DOM树
  // 对于不同标记的fiber，会进行不同的处理：
  //  标志update的会在原来的真实DOM上更新属性，卸载旧属性。
  //  标志删除的，会根据return，拿到父节点，对该节点，removeChild
  //  PLACEMENT表示要创建
  function commitWork(fiber) {
    if (!fiber) {
      return;
    }

    // 拿到当前处理Fiber的父标签
    let domParentFiber = fiber.return;
    // 假如当前的fiber的父级是App组件，App Fiber并不代表真实的DOM。而应该是上一级的div#root，通过一个循环找到最近的父级
    while (!domParentFiber.dom) {
      domParentFiber = domParentFiber.return;
    }
    // 拿到父级DOM
    const domParent = domParentFiber.dom;

    // 如果当前Fiber是替换，则加入作为父级的子元素，利用appendChild方法
    if (fiber.effectTag === 'PLACEMENT' && fiber.dom != null) {
      domParent.appendChild(fiber.dom);
    }
    //
    else if (fiber.effectTag === 'UPDATE' && fiber.dom != null) {
      updateDom(fiber.dom, fiber.alternate.props, fiber.props);
    } else if (fiber.effectTag === 'DELETION') {
      commitDeletion(fiber, domParent);
    }

    // 这里可以进行优化，更新阶段，当fiber节点标志移除，意味着整棵子树都被移除了，那么整棵树都不需要再遍历，增了多余appendChild操作。
    commitWork(fiber.child);
    commitWork(fiber.sibling);
  }

  // 对真实DOM，删除节点
  function commitDeletion(fiber, domParent) {
    if (fiber.dom) {
      domParent.removeChild(fiber.dom);
    } else {
      commitDeletion(fiber.child, domParent);
    }
  }

  function isDepsEqual(deps, newDeps) {
    if (deps.length !== newDeps.length) {
      return false;
    }

    for (let i = 0; i < deps.length; i++) {
      if (deps[i] !== newDeps[i]) {
        return false;
      }
    }
    return true;
  }

  // 内部的方法，通过递归，对真个链表的存在的effectHook进行处理
  function commitEffectHooks() {
    // 在我们执行新的useEffect之前，需要对之前的useEffect清理副作用的方法，进行执行。
    function runCleanup(fiber) {
      if (!fiber) return;
      fiber.alternate?.effectHooks?.forEach((hook, index) => {
        const deps = fiber.effectHooks[index].deps;
        // 比较依赖是否变化，决定是否执行清理副作用
        if (!hook.deps || !isDepsEqual(hook.deps, deps)) {
          hook.cleanup?.();
        }
      });

      runCleanup(fiber.child);
      runCleanup(fiber.sibling);
    }

    // 清理完副作用后，执行方法
    function run(fiber) {
      if (!fiber) return;

      fiber.effectHooks?.forEach((newHook, index) => {
        if (!fiber.alternate) {
          newHook.cleanup = newHook.callback();
          return;
        }

        if (!newHook.deps) {
          newHook.cleanup = newHook.callback();
        }

        if (newHook.deps.length > 0) {
          const oldHook = fiber.alternate?.effectHooks[index];

          if (!isDepsEqual(oldHook.deps, newHook.deps)) {
            newHook.cleanup = newHook.callback();
          }
        }
      });

      run(fiber.child);
      run(fiber.sibling);
    }

    runCleanup(wipRoot);
    run(wipRoot);
  }

  const MiniReact = {
    createElement,
    render,
    useState,
    useEffect,
  };

  window.MiniReact = MiniReact;
})();
