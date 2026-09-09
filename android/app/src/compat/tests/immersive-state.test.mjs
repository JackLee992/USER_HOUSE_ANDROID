import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

test('real Java immersive lifecycle preserves a paused game request and restores bars on exit/navigation/destroy',()=>{
 const temp=mkdtempSync(join(tmpdir(),'wanba-immersive-'));
 const java=process.env.JAVA_HOME||'/Applications/Android Studio.app/Contents/jbr/Contents/Home';
 const source=fileURLToPath(new URL('../../main/java/io/github/jacklee992/wanba/GameImmersiveState.java',import.meta.url));
 try {
  const fixture=join(temp,'ImmersiveFixture.java');
  writeFileSync(fixture,`package io.github.jacklee992.wanba;
import java.util.*;
public class ImmersiveFixture {
 public static void main(String[] args) {
  List<Boolean> calls=new ArrayList<>();GameImmersiveState state=new GameImmersiveState(calls::add);
  if(state.active()||!calls.equals(Arrays.asList(false)))throw new AssertionError("catalog starts with bars");
  state.request(true);state.request(true);if(!state.active()||!calls.equals(Arrays.asList(false,true)))throw new AssertionError("enter once");
  state.foreground(false);state.foreground(false);if(state.active())throw new AssertionError("background bars shown");
  state.foreground(true);if(!state.active())throw new AssertionError("same paused game restores immersive");
  state.reset();state.foreground(false);state.foreground(true);if(state.active())throw new AssertionError("navigation cannot reenter stale game");
  state.foreground(false);state.request(true);if(state.active())throw new AssertionError("no background hiding");
  state.request(false);state.foreground(true);if(state.active())throw new AssertionError("exit while background stays catalog");
  state.request(true);state.destroy();state.request(true);state.foreground(true);if(state.active())throw new AssertionError("destroyed view cannot hide bars");
  if(!calls.equals(Arrays.asList(false,true,false,true,false,true,false)))throw new AssertionError(calls);
  System.out.print("immersive lifecycle passed");
 }
}`);
  execFileSync(join(java,'bin/javac'),['-d',temp,source,fixture],{stdio:'pipe'});
  assert.equal(execFileSync(join(java,'bin/java'),['-cp',temp,'io.github.jacklee992.wanba.ImmersiveFixture'],{encoding:'utf8'}),'immersive lifecycle passed');
 } finally {rmSync(temp,{recursive:true,force:true});}
});
